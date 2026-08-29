import { authenticate } from "../_shared/auth.ts";
import {
  ApiError,
  errorResponse,
  handleOptions,
  json,
  requireMethod,
} from "../_shared/http.ts";

const MAX_AUDIO_BYTES = 8 * 1024 * 1024;
const MAX_DURATION_MS = 60_000;

const MIME_FORMATS: Record<string, string> = {
  "audio/webm": "webm",
  "audio/webm;codecs=opus": "webm",
  "audio/ogg": "ogg",
  "audio/ogg;codecs=opus": "ogg",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
};

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 32_768;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

async function audioHash(bytes: Uint8Array): Promise<string> {
  const input = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const digest = await crypto.subtle.digest("SHA-256", input);
  return Array.from(new Uint8Array(digest)).map((value) => value.toString(16).padStart(2, "0")).join("");
}

function dashScopeBaseUrl(): string {
  const explicit = Deno.env.get("DASHSCOPE_BASE_URL")?.replace(/\/$/, "");
  if (explicit) return explicit;
  const workspaceId = Deno.env.get("DASHSCOPE_WORKSPACE_ID");
  if (!workspaceId) {
    throw new ApiError("MODEL_NOT_CONFIGURED", "语音识别服务尚未配置", 503);
  }
  return `https://${workspaceId}.cn-beijing.maas.aliyuncs.com`;
}

Deno.serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;

  try {
    requireMethod(request, "POST");
    const { userId, adminClient } = await authenticate(request);

    const form = await request.formData();
    const audio = form.get("audio");
    if (!(audio instanceof File)) {
      throw new ApiError("VALIDATION_ERROR", "缺少 audio 音频文件", 400);
    }
    const clientRequestId = String(form.get("clientRequestId") ?? "").trim();
    if (!clientRequestId || clientRequestId.length > 128) {
      throw new ApiError("VALIDATION_ERROR", "clientRequestId 缺失或过长", 400);
    }

    const durationValue = form.get("durationMs");
    const durationMs = durationValue === null ? null : Number(durationValue);
    if (durationMs !== null && (!Number.isFinite(durationMs) || durationMs < 0)) {
      throw new ApiError("VALIDATION_ERROR", "durationMs 格式不正确", 400);
    }
    if (durationMs !== null && durationMs > MAX_DURATION_MS) {
      throw new ApiError("ASR_TOO_LONG", "单次录音不能超过 60 秒", 413);
    }
    if (audio.size > MAX_AUDIO_BYTES) {
      throw new ApiError("ASR_TOO_LONG", "音频文件过大，请缩短录音后重试", 413);
    }

    const normalizedMime = audio.type.toLowerCase();
    const format = MIME_FORMATS[normalizedMime];
    if (!format) {
      throw new ApiError("ASR_UNSUPPORTED_FORMAT", `不支持的音频格式：${audio.type || "unknown"}`, 415);
    }

    const bytes = new Uint8Array(await audio.arrayBuffer());
    const requestHash = await audioHash(bytes);
    const operation = "speech-asr";
    const { data: previous } = await adminClient.from("idempotency_results")
      .select("request_hash,response")
      .eq("user_id", userId)
      .eq("operation", operation)
      .eq("idempotency_key", clientRequestId)
      .maybeSingle();
    if (previous?.response) {
      if (previous.request_hash !== requestHash) {
        throw new ApiError("IDEMPOTENCY_CONFLICT", "clientRequestId 已用于其他录音", 409);
      }
      return json(request, previous.response);
    }

    const requestId = crypto.randomUUID();
    if (Deno.env.get("AI_MOCK_MODE") === "true") {
      const responseBody = {
        requestId,
        text: Deno.env.get("SPEECH_MOCK_TEXT") ?? "昨晚睡得不太好，半夜醒了两次。",
        durationMs: durationMs ?? 0,
      };
      await adminClient.from("idempotency_results").insert({
        user_id: userId, operation, idempotency_key: clientRequestId, request_hash: requestHash, response: responseBody,
      });
      return json(request, responseBody);
    }

    const apiKey = Deno.env.get("DASHSCOPE_API_KEY");
    if (!apiKey) {
      throw new ApiError("MODEL_NOT_CONFIGURED", "语音识别服务尚未配置", 503);
    }

    let response: Response;
    try {
      response = await fetch(`${dashScopeBaseUrl()}/api/v1/services/aigc/multimodal-generation/generation`, {
        method: "POST",
        signal: AbortSignal.timeout(65_000),
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "X-DashScope-WorkSpace": Deno.env.get("DASHSCOPE_WORKSPACE_ID") ?? "",
        },
        body: JSON.stringify({
          model: Deno.env.get("ASR_MODEL") ?? "fun-asr-realtime",
          input: {
            messages: [{
              role: "user",
              content: [{ audio: `data:${audio.type};base64,${toBase64(bytes)}` }],
            }],
          },
          parameters: { format },
          resources: [],
        }),
      });
    } catch {
      throw new ApiError("ASR_FAILED", "语音识别连接超时，请稍后重试", 500);
    }

    const result = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok) {
      console.error("ASR provider error", response.status, result);
      throw new ApiError("ASR_FAILED", "语音识别失败，请稍后重试", 500);
    }

    const output = (result.output ?? {}) as Record<string, unknown>;
    const text = typeof output.text === "string" ? output.text.trim() : "";
    if (!text) throw new ApiError("ASR_FAILED", "未识别到有效文字", 500);

    const usage = (result.usage ?? {}) as Record<string, unknown>;
    const providerDuration = Number(usage.duration);
    const responseBody = {
      requestId: typeof result.request_id === "string" ? result.request_id : requestId,
      text,
      durationMs: durationMs ?? (Number.isFinite(providerDuration) ? providerDuration * 1000 : 0),
    };
    const { error: idempotencyError } = await adminClient.from("idempotency_results").insert({
      user_id: userId, operation, idempotency_key: clientRequestId, request_hash: requestHash, response: responseBody,
    });
    if (idempotencyError) console.warn("Unable to persist ASR idempotency result", idempotencyError.message);
    return json(request, responseBody);
  } catch (error) {
    return errorResponse(request, error);
  }
});
