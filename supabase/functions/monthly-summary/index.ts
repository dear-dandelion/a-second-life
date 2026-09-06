import { authenticate } from "../_shared/auth.ts";
import { isIsoMonth, shanghaiMonth } from "../_shared/date.ts";
import { ApiError, errorResponse, handleOptions, json, readJson, requireMethod } from "../_shared/http.ts";
import { completeText, hasTextModel, isMockMode } from "../_shared/model.ts";

interface SummaryRequest { month: string }

function toResponse(row: Record<string, unknown>) {
  return {
    id: row.id,
    month: String(row.month).slice(0, 7),
    overview: row.overview,
    goodThings: row.good_things,
    dimensions: row.dimensions,
    generatedAt: row.generated_at,
    hasNew: row.has_new,
  };
}

Deno.serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;
  try {
    requireMethod(request, "POST");
    const { userId, userClient, adminClient } = await authenticate(request, { requireSelfUser: true });
    const body = await readJson<SummaryRequest>(request);
    if (!isIsoMonth(body?.month ?? "") || body.month > shanghaiMonth()) {
      throw new ApiError("VALIDATION_ERROR", "月份不正确", 400);
    }
    const monthDate = `${body.month}-01`;
    const { data: existing } = await adminClient.from("monthly_summaries")
      .select("*").eq("user_id", userId).eq("month", monthDate).maybeSingle();
    if (existing) return json(request, toResponse(existing));

    const { data: stats, error: statsError } = await userClient.rpc("get_monthly_stats", { target_month: body.month });
    if (statsError) throw new ApiError("INTERNAL_ERROR", "无法读取月度记录", 500);
    const days = (stats?.days ?? []) as Array<Record<string, unknown>>;
    const recordedDays = days.filter((day) => day.hasRecord).length;
    const exerciseDays = days.filter((day) => day.exercise).length;
    const settledMoodDays = days.filter((day) => ["舒展", "平静"].includes(String((day.mood as Record<string, unknown> | null)?.state ?? ""))).length;
    let overview = recordedDays
      ? `这个月一共记录了 ${recordedDays} 天。你正在用自己的节奏关注身体和心情，这些记录会帮助你更清楚地回顾变化。`
      : "这个月还没有留下健康记录。任何时候开始都不晚，可以先记下一件身体或心情上的小变化。";
    const goodThings = [
      ...(exerciseDays ? [`这个月有 ${exerciseDays} 天记录了运动或活动。`] : []),
      ...(settledMoodDays ? [`这个月有 ${settledMoodDays} 天记录了舒展或平静的感受。`] : []),
      ...(recordedDays ? [`你为自己留下了 ${recordedDays} 天真实记录。`] : ["你仍然可以从今天开始关心自己。"]),
    ].slice(0, 3);
    const dimensions = [
      { key: "sleep", title: "睡眠", content: `有 ${days.filter((day) => day.sleep).length} 天留下睡眠记录。` },
      { key: "hotFlash", title: "潮热", content: `有 ${days.filter((day) => day.hotFlash).length} 天留下潮热记录。` },
      { key: "mood", title: "心情", content: `有 ${days.filter((day) => day.mood).length} 天留下心情记录。` },
      { key: "exercise", title: "运动", content: `有 ${exerciseDays} 天留下运动记录。` },
    ];

    if (!isMockMode() && hasTextModel()) {
      try {
        const generated = await completeText([
          { role: "system", content: "根据给定月度聚合写一段不诊断、温和、客观的中文总结，不超过180字，不编造数据。" },
          { role: "user", content: JSON.stringify(stats) },
        ], { temperature: 0.2, useFast: true });
        overview = generated.slice(0, 500);
      } catch (error) {
        console.warn("Monthly summary model fallback", error instanceof Error ? error.message : String(error));
      }
    }

    const { data: inserted, error: insertError } = await adminClient.from("monthly_summaries").upsert({
      user_id: userId,
      month: monthDate,
      overview,
      good_things: goodThings,
      dimensions,
      has_new: true,
      source_version: isMockMode() ? "deterministic-mvp-v1" : "model-mvp-v1",
    }, { onConflict: "user_id,month", ignoreDuplicates: true }).select("*").maybeSingle();
    if (insertError) throw new ApiError("INTERNAL_ERROR", "无法保存月度总结", 500);
    if (inserted) return json(request, toResponse(inserted));
    const { data: concurrent } = await adminClient.from("monthly_summaries")
      .select("*").eq("user_id", userId).eq("month", monthDate).single();
    return json(request, toResponse(concurrent));
  } catch (error) {
    return errorResponse(request, error);
  }
});
