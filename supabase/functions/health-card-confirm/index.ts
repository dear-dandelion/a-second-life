import { authenticate } from "../_shared/auth.ts";
import { applyDraftItems } from "../_shared/health.ts";
import { ApiError, errorResponse, handleOptions, json, readJson, requireMethod } from "../_shared/http.ts";
import type { HealthDraftItem, HealthRecord } from "../_shared/types.ts";

interface ConfirmRequest {
  draftId: string;
  selectedItems: Array<{
    clientItemId: string;
    operation: "create" | "update" | "delete";
    targetRecordId?: string;
    data?: Record<string, unknown> | string;
  }>;
}

Deno.serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;
  try {
    requireMethod(request, "POST");
    const { userId, userClient, adminClient } = await authenticate(request, { requireSelfUser: true });
    const body = await readJson<ConfirmRequest>(request);
    const idempotencyKey = request.headers.get("idempotency-key")?.trim();
    if (!idempotencyKey || idempotencyKey.length > 128 || !body?.draftId || !Array.isArray(body.selectedItems) || body.selectedItems.length === 0 || body.selectedItems.length > 30) {
      throw new ApiError("VALIDATION_ERROR", "草案、所选条目或幂等键缺失", 400);
    }
    if (new Set(body.selectedItems.map((item) => item.clientItemId)).size !== body.selectedItems.length) {
      throw new ApiError("VALIDATION_ERROR", "所选草案条目不能重复", 400);
    }

    const { data: draft, error: draftError } = await adminClient.from("chat_card_drafts")
      .select("id,user_id,record_date,items,processed_at,expires_at")
      .eq("id", body.draftId)
      .eq("user_id", userId)
      .maybeSingle();
    if (draftError || !draft) {
      throw new ApiError("DRAFT_NOT_FOUND", "健康记录草案不存在", 404);
    }

    const authoritative = new Map<string, HealthDraftItem>(
      ((draft.items ?? []) as HealthDraftItem[]).map((item) => [item.clientItemId, item]),
    );
    const selected: HealthDraftItem[] = body.selectedItems.map((input) => {
      const source = authoritative.get(input.clientItemId);
      if (!source || source.operation !== input.operation || (source.targetRecordId || null) !== (input.targetRecordId || null)) {
        throw new ApiError("VALIDATION_ERROR", "草案条目与原始内容不一致", 400);
      }
      return {
        ...source,
        data: input.data ?? source.after ?? source.data,
        after: undefined,
      };
    });

    const { data: recordWrapper, error: readError } = await userClient.rpc("get_health_record", { target_date: draft.record_date });
    if (readError) throw new ApiError("INTERNAL_ERROR", "无法读取当日记录", 500);
    const existing = (recordWrapper?.record ?? null) as HealthRecord | null;
    const nextRecord = applyDraftItems(existing, draft.record_date, selected);
    const categories = [...new Set(selected.map((item) => item.category))];
    const { data: saveResult, error: saveError } = await userClient.rpc("patch_health_record", {
      target_date: draft.record_date,
      expected_version: existing?.version ?? 0,
      payload: nextRecord,
      categories,
    });
    if (saveError) {
      const known = ["ROLE_NOT_ALLOWED", "DRAFT_NOT_FOUND", "ITEM_ALREADY_SAVED", "IDEMPOTENCY_CONFLICT", "RECORD_VERSION_CONFLICT"]
        .find((code) => saveError.message.includes(code));
      const status = known === "ROLE_NOT_ALLOWED" ? 403 : known === "DRAFT_NOT_FOUND" ? 404 : known?.includes("SAVED") || known === "IDEMPOTENCY_CONFLICT" || known === "RECORD_VERSION_CONFLICT" ? 409 : 400;
      throw new ApiError(known ?? "VALIDATION_ERROR", known === "ROLE_NOT_ALLOWED" ? "当前账号暂不支持此功能" : known === "DRAFT_NOT_FOUND" ? "健康记录草案不存在或已过期" : known === "ITEM_ALREADY_SAVED" ? "该草案已经保存" : known === "IDEMPOTENCY_CONFLICT" ? "幂等键已用于不同请求" : "健康记录内容校验失败", status);
    }
    await adminClient.from("chat_card_drafts").update({ processed_at: new Date().toISOString() }).eq("id", draft.id).is("processed_at", null);
    return json(request, { ...saveResult, savedItemCount: selected.length });
  } catch (error) {
    return errorResponse(request, error);
  }
});
