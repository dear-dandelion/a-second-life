import { authenticate } from "../_shared/auth.ts";
import { ApiError, errorResponse, handleOptions, json, readJson, requireMethod } from "../_shared/http.ts";
import { completeText, hasTextModel, isMockMode } from "../_shared/model.ts";
import { sha256 } from "../_shared/health.ts";

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
      output = `我想${audience === "不指定" ? "认真" : `和${audience}`}说说我的感受：${input}。如果你方便，我希望你能听我慢慢说，也谢谢你的理解。`;
    } else {
      if (!hasTextModel()) throw new ApiError("MODEL_NOT_CONFIGURED", "模型服务暂未配置", 503);
      output = (await completeText([
        { role: "system", content: `把用户原话整理成温和、真诚、不指责的中文表达。表达对象是${audience === "不指定" ? "用户未指定的对象" : audience}。保留事实和诉求，不添加新事实，只输出改写后的正文。` },
        { role: "user", content: input },
      ], { temperature: 0.3, useFast: true })).slice(0, 3000);
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
