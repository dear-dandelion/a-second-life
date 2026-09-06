import { authenticate } from "../_shared/auth.ts";
import { ApiError, errorResponse, handleOptions, json, readJson, requireMethod } from "../_shared/http.ts";
import { completeText, hasTextModel, isMockMode } from "../_shared/model.ts";
import { sha256 } from "../_shared/health.ts";
import { isPromptInjectionAttempt, isUserPerspectiveRewrite, readRewrite, rephrasePrompt } from "../_shared/rephrase.mjs";

interface RephraseRequest { clientRequestId: string; text: string; style: "warm"; audience?: "伴侣" | "家人" | "朋友" | "同事" | "不指定" }

const AUDIENCES = new Set(["伴侣", "家人", "朋友", "同事", "不指定"]);

Deno.serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;
  try {
    requireMethod(request, "POST");
    const { userId, adminClient } = await authenticate(request);
    const body = await readJson<RephraseRequest>(request);
    const input = typeof body?.text === "string" ? body.text.trim() : "";
    if (!input || input.length > 2000 || !body.clientRequestId || body.clientRequestId.length > 128 || body.style !== "warm" || (body.audience && !AUDIENCES.has(body.audience))) {
      throw new ApiError("VALIDATION_ERROR", "请输入需要整理的内容", 400);
    }
    if (isPromptInjectionAttempt(input)) throw new ApiError("VALIDATION_ERROR", "请直接输入希望转达给对方的话", 400);
    const audience = body.audience ?? "不指定";
    const requestHash = await sha256({ text: input, style: body.style, audience });
    const operation = "ai-rephrase";
    const { data: previous } = await adminClient.from("idempotency_results")
      .select("request_hash,response")
      .eq("user_id", userId)
      .eq("operation", operation)
      .eq("idempotency_key", body.clientRequestId)
      .maybeSingle();
    if (previous?.response) {
      if (previous.request_hash !== requestHash) {
        throw new ApiError("IDEMPOTENCY_CONFLICT", "clientRequestId 已用于其他内容", 409);
      }
      return json(request, previous.response);
    }
    let output: string;
    if (isMockMode()) {
      output = `我想${audience === "不指定" ? "认真" : `和${audience}`}说说心里的感受：${input}。我希望你能理解我此刻的心情，也愿意听我把话说完。`;
    } else {
      if (!hasTextModel()) throw new ApiError("MODEL_NOT_CONFIGURED", "模型服务暂未配置", 503);
      const sourceMessage = { role: "user" as const, content: `<source_text>\n${input}\n</source_text>` };
      const firstAttempt = await completeText([
        { role: "system", content: rephrasePrompt(audience) },
        sourceMessage,
      ], { json: true, temperature: 0.15, useFast: false });
      output = readRewrite(firstAttempt);
      if (!isUserPerspectiveRewrite(output)) {
        const retry = await completeText([
          { role: "system", content: rephrasePrompt(audience) },
          { role: "system", content: "上一版输出不合格：它像是在回应或安慰用户。现在只输出用户本人第一人称、可直接发送的转写 JSON。" },
          sourceMessage,
        ], { json: true, temperature: 0.1, useFast: false });
        output = readRewrite(retry);
      }
      if (!isUserPerspectiveRewrite(output)) throw new ApiError("MODEL_INVALID_RESPONSE", "暂时无法整理为可发送的表达，请稍后重试", 502);
    }
    const response = { text: output };
    const { error: idempotencyError } = await adminClient.from("idempotency_results").insert({
      user_id: userId,
      operation,
      idempotency_key: body.clientRequestId,
      request_hash: requestHash,
      response,
    });
    if (idempotencyError) console.warn("Unable to persist rephrase idempotency result", idempotencyError.message);
    return json(request, response);
  } catch (error) {
    return errorResponse(request, error);
  }
});
