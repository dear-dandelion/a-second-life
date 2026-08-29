import { authenticate } from "../_shared/auth.ts";
import {
  ApiError,
  corsHeaders,
  errorResponse,
  handleOptions,
  readJson,
  requireMethod,
} from "../_shared/http.ts";

type TtsRequest = {
  messageId?: string;
  text?: string;
};

const MAX_TEXT_LENGTH = 300;

function mockWav(): Uint8Array {
  const sampleRate = 8_000;
  const sampleCount = 1_200;
  const dataSize = sampleCount * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const write = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
  };
  write(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, dataSize, true);
  return new Uint8Array(buffer);
}

function dashScopeBaseUrl(): string {
  const explicit = Deno.env.get("DASHSCOPE_BASE_URL")?.replace(/\/$/, "");
  if (explicit) return explicit;
  const workspaceId = Deno.env.get("DASHSCOPE_WORKSPACE_ID");
  if (!workspaceId) {
    throw new ApiError("MODEL_NOT_CONFIGURED", "语音合成服务尚未配置", 503);
  }
  return `https://${workspaceId}.cn-beijing.maas.aliyuncs.com`;
}

function audioUrlFrom(result: Record<string, unknown>): string | null {
  const output = (result.output ?? {}) as Record<string, unknown>;
  const audio = (output.audio ?? {}) as Record<string, unknown>;
  const candidates = [audio.url, output.audio_url, output.url, result.audio_url];
  return candidates.find((value): value is string => typeof value === "string" && value.length > 0) ?? null;
}

Deno.serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;

  try {
    requireMethod(request, "POST");
    const { userId, adminClient } = await authenticate(request);
    const body = await readJson<TtsRequest>(request);
    const text = body.text?.trim() ?? "";
    if (!body.messageId || !text) throw new ApiError("VALIDATION_ERROR", "messageId 和 text 不能为空", 400);
    if (text.length > MAX_TEXT_LENGTH) {
      throw new ApiError("VALIDATION_ERROR", `朗读文本不能超过 ${MAX_TEXT_LENGTH} 字`, 400);
    }
    const { data: message } = await adminClient.from("chat_messages")
      .select("speakable_text")
      .eq("id", body.messageId)
      .eq("user_id", userId)
      .eq("role", "assistant")
      .maybeSingle();
    if (!message || message.speakable_text !== text) {
      throw new ApiError("VALIDATION_ERROR", "只能朗读当前用户已完成的 AI 回复", 400);
    }

    if (Deno.env.get("AI_MOCK_MODE") === "true") {
      return new Response(mockWav().buffer as ArrayBuffer, {
        headers: {
          ...corsHeaders(request),
          "Content-Type": "audio/wav",
          "Cache-Control": "no-store",
        },
      });
    }

    const apiKey = Deno.env.get("DASHSCOPE_API_KEY");
    if (!apiKey) throw new ApiError("MODEL_NOT_CONFIGURED", "语音合成服务尚未配置", 503);

    let providerResponse: Response;
    try {
      providerResponse = await fetch(`${dashScopeBaseUrl()}/api/v1/services/audio/tts/SpeechSynthesizer`, {
        method: "POST",
        signal: AbortSignal.timeout(45_000),
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "X-DashScope-WorkSpace": Deno.env.get("DASHSCOPE_WORKSPACE_ID") ?? "",
        },
        body: JSON.stringify({
          model: Deno.env.get("TTS_MODEL") ?? "cosyvoice-v3-flash",
          input: {
            text,
            voice: Deno.env.get("TTS_VOICE") ?? "longanyang",
            format: "mp3",
            sample_rate: 24_000,
          },
        }),
      });
    } catch {
      throw new ApiError("TTS_FAILED", "语音合成连接超时，请稍后重试", 500);
    }
    const result = await providerResponse.json().catch(() => ({})) as Record<string, unknown>;
    if (!providerResponse.ok) {
      console.error("TTS provider error", providerResponse.status, result);
      throw new ApiError("TTS_FAILED", "语音合成失败，请稍后重试", 500);
    }

    const audioUrl = audioUrlFrom(result);
    if (!audioUrl) throw new ApiError("TTS_FAILED", "语音服务未返回音频地址", 500);
    const audioResponse = await fetch(audioUrl, { signal: AbortSignal.timeout(20_000) }).catch(() => null);
    if (!audioResponse?.ok || !audioResponse.body) {
      throw new ApiError("TTS_FAILED", "音频下载失败，请稍后重试", 500);
    }

    return new Response(audioResponse.body, {
      headers: {
        ...corsHeaders(request),
        "Content-Type": audioResponse.headers.get("Content-Type") ?? "audio/mpeg",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return errorResponse(request, error);
  }
});
