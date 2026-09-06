import { authenticate } from "../_shared/auth.ts";
import { reportStartDate, shanghaiDate } from "../_shared/date.ts";
import { ApiError, errorResponse, handleOptions, json, readJson, requireMethod } from "../_shared/http.ts";

type ReportRange = "1_month" | "3_months" | "6_months";

interface ReportRequest {
  range: ReportRange;
  chiefComplaint?: string;
}

function mode<T extends string>(values: Array<T | null | undefined>): T | null {
  const counts = new Map<T, number>();
  for (const value of values) if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

Deno.serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;
  try {
    requireMethod(request, "POST");
    const { userId, profile, adminClient } = await authenticate(request, { requireSelfUser: true });
    const body = await readJson<ReportRequest>(request);
    if (!["1_month", "3_months", "6_months"].includes(body?.range)) {
      throw new ApiError("VALIDATION_ERROR", "报告时间范围不正确", 400);
    }
    const endDate = shanghaiDate();
    const startDate = reportStartDate(body.range, endDate);
    const { data: records, error: recordsError } = await adminClient.from("health_records")
      .select("id,record_date,appetite,medical_needs")
      .eq("user_id", userId)
      .gte("record_date", startDate)
      .lte("record_date", endDate)
      .order("record_date");
    if (recordsError) throw new ApiError("INTERNAL_ERROR", "无法聚合健康记录", 500);
    const recordIds = (records ?? []).map((item) => item.id);

    const empty = { data: [] as Array<Record<string, unknown>>, error: null };
    const [symptomResult, menstrualResult, weightResult, exerciseResult, medicationResult] = recordIds.length
      ? await Promise.all([
        adminClient.from("symptom_records").select("record_id,symptom,occurred,severity,frequency_count,trend,quote").in("record_id", recordIds),
        adminClient.from("menstrual_records").select("record_id,event,event_date,days_since_last,note").in("record_id", recordIds),
        adminClient.from("weight_records").select("record_id,direction,amount,speed,record_date").in("record_id", recordIds).order("record_date"),
        adminClient.from("exercise_records").select("record_id,type,duration,frequency,intensity").in("record_id", recordIds),
        adminClient.from("medication_mentions").select("record_id,name,action,created_at").in("record_id", recordIds),
      ])
      : [empty, empty, empty, empty, empty];
    const aggregationError = [symptomResult, menstrualResult, weightResult, exerciseResult, medicationResult]
      .find((result) => result.error)?.error;
    if (aggregationError) {
      console.error("Report aggregation failed", aggregationError.message);
      throw new ApiError("INTERNAL_ERROR", "无法聚合报告内容", 500);
    }

    const recordDateById = new Map((records ?? []).map((item) => [item.id, item.record_date]));
    const symptoms = (symptomResult.data ?? []).filter((item) => item.occurred !== false);
    const symptomNames = [...new Set(symptoms.map((item) => String(item.symptom)))];
    const symptomSummary = symptomNames.map((name) => {
      const entries = symptoms.filter((item) => item.symptom === name);
      const counts = entries.map((item) => Number(item.frequency_count)).filter(Number.isFinite);
      const average = counts.length ? counts.reduce((sum, value) => sum + value, 0) / counts.length : null;
      return {
        symptom: name,
        days: new Set(entries.map((item) => recordDateById.get(String(item.record_id)))).size,
        frequencySummary: average === null ? `窗口内记录 ${entries.length} 次` : `有明确次数的记录平均每天约 ${average.toFixed(1)} 次`,
        severityMode: mode(entries.map((item) => item.severity as "轻" | "中" | "重" | null)),
        trend: mode(entries.map((item) => item.trend as "加重" | "减轻" | "稳定" | null)),
        quotes: entries.map((item) => String(item.quote ?? "")).filter(Boolean).slice(0, 3),
      };
    });

    const menstrual = menstrualResult.data ?? [];
    const menstrualText = menstrual.length === 0
      ? "所选时间范围内暂无月经与出血记录。"
      : `所选时间范围内记录 ${menstrual.length} 次月经/出血相关事件：${menstrual.map((item) => item.event).join("、")}。`;
    const weights = weightResult.data ?? [];
    const latestWeight = weights.at(-1);
    const weightText = latestWeight
      ? `最近一次记录为体重${latestWeight.direction}${latestWeight.amount ? `约${latestWeight.amount}` : ""}，变化${latestWeight.speed ?? "速度未记录"}。`
      : "所选时间范围内暂无体重变化记录。";
    const exercises = exerciseResult.data ?? [];
    const exerciseTypes = [...new Set(exercises.map((item) => String(item.type)))];
    const exerciseText = exercises.length
      ? `共记录运动 ${exercises.length} 天，主要包括${exerciseTypes.join("、")}。`
      : "所选时间范围内暂无运动记录。";
    const medicationMentions = (medicationResult.data ?? []).sort((a, b) => {
      const dateOrder = String(recordDateById.get(String(a.record_id)) ?? "").localeCompare(String(recordDateById.get(String(b.record_id)) ?? ""));
      return dateOrder || String(a.created_at).localeCompare(String(b.created_at));
    });
    const recordedMedications = [...new Map(medicationMentions.map((item) => [String(item.name), item])).values()].map((item) => ({
      name: item.name,
      status: item.action === "停用" ? "已停用" : "服用中",
    }));
    const medications = [
      ...(profile.regular_medications.trim() ? [{ name: profile.regular_medications.trim(), status: "长期/规律用药" }] : []),
      ...recordedMedications,
    ];
    const warnings: string[] = [];
    if ((records ?? []).length === 0) warnings.push("所选时间范围内没有已确认的健康记录，报告主要为空模板。");
    else if ((records ?? []).length < 7) warnings.push("记录天数较少，汇总可能无法代表整个时间范围。请在就诊前核对并补充。");

    return json(request, {
      reportId: null,
      range: { startDate, endDate },
      profile: {
        birthYear: profile.birth_year,
        height: profile.height_cm,
        menopausalStatus: profile.menopausal_status || null,
        usesMedication: medications.length ? medications.some((item) => item.status !== "已停用") : null,
        chiefComplaint: String(body.chiefComplaint ?? records?.find((item) => item.medical_needs)?.medical_needs ?? "").slice(0, 1000),
        medicalHistory: profile.medical_history,
        surgeryHistory: profile.surgery_history,
        medications,
        allergies: profile.allergy_history ? [profile.allergy_history] : [],
        pregnancyHistory: profile.pregnancy_history || null,
        familyHistory: profile.family_history || null,
        screenings: profile.screening_history || null,
      },
      summary: {
        menstrual: menstrualText,
        symptoms: symptomSummary,
        weight: weightText,
        exercise: exerciseText,
      },
      dataWarnings: warnings,
    });
  } catch (error) {
    return errorResponse(request, error);
  }
});
