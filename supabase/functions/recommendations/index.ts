import { authenticate } from "../_shared/auth.ts";
import { shanghaiDate } from "../_shared/date.ts";
import { ApiError, errorResponse, handleOptions, json, requireMethod } from "../_shared/http.ts";

const defaults = [
  { id: "default-walk", category: "走起来", title: "轻松走一走", description: "按自己舒服的节奏散步 15～20 分钟，不追求速度。" },
  { id: "default-sleep", category: "睡得好", title: "给睡前留一点安静", description: "睡前半小时减少屏幕刺激，做几次缓慢呼吸。" },
];

Deno.serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;
  try {
    requireMethod(request, "GET");
    const { userId, profile, adminClient } = await authenticate(request);
    if (profile.user_type === "supporter") return json(request, { source: "default", items: defaults });

    const today = shanghaiDate();
    const since = new Date(`${today}T00:00:00Z`);
    since.setUTCDate(since.getUTCDate() - 3);
    const { data: records, error: recordsError } = await adminClient.from("health_records")
      .select("id,record_date")
      .eq("user_id", userId)
      .gte("record_date", since.toISOString().slice(0, 10))
      .lte("record_date", today)
      .order("record_date", { ascending: false })
      .limit(1);
    if (recordsError) throw new ApiError("INTERNAL_ERROR", "无法读取今日记录", 500);
    if (!records?.length) return json(request, { source: "default", items: defaults });

    const record = records[0];
    const [sleepResult, symptomsResult, moodResult] = await Promise.all([
      adminClient.from("sleep_records").select("quality,detail").eq("record_id", record.id).maybeSingle(),
      adminClient.from("symptom_records").select("symptom,severity,occurred").eq("record_id", record.id).eq("occurred", true),
      adminClient.from("mood_records").select("state,description").eq("record_id", record.id).maybeSingle(),
    ]);
    const childError = [sleepResult, symptomsResult, moodResult].find((result) => result.error)?.error;
    if (childError) throw new ApiError("INTERNAL_ERROR", "无法生成今日建议", 500);
    const sleep = sleepResult.data;
    const symptoms = symptomsResult.data;
    const mood = moodResult.data;
    const items = [] as typeof defaults;
    if (sleep?.quality === "差" || sleep?.detail) {
      items.push({ id: "sleep-wind-down", category: "睡得好", title: "今晚早点放松", description: "把睡前安排得简单一点，避免临睡前大量咖啡因和长时间看屏幕。" });
    }
    if ((symptoms ?? []).some((item) => ["关节痛", "腰背痛", "疲劳"].includes(item.symptom))) {
      items.push({ id: "gentle-move", category: "走起来", title: "做温和活动", description: "如果身体允许，可分段散步或做轻柔伸展；不舒服就及时停下。" });
    }
    if (mood && ["低落", "焦虑", "烦躁"].includes(mood.state)) {
      items.push({ id: "mood-pause", category: "心情好", title: "给情绪一个出口", description: "找一个信任的人聊几句，或写下此刻最困扰你的事情。" });
    }
    for (const fallback of defaults) if (items.length < 2 && !items.some((item) => item.id === fallback.id)) items.push(fallback);
    return json(request, {
      source: record.record_date === today ? "today" : "recent_3_days",
      items: items.slice(0, 3),
    });
  } catch (error) {
    return errorResponse(request, error);
  }
});
