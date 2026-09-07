import { authenticate } from "../_shared/auth.ts";
import { frequencySummary, latestMedicalNeed } from "../_shared/report-facts.ts";
import { buildReportFields } from "../_shared/report-fields.ts";
import type { HealthRecord, Profile } from "../_shared/types.ts";
import { ApiError, errorResponse, handleOptions, json, readJson, requireMethod } from "../_shared/http.ts";

Deno.serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;
  try {
    requireMethod(request, "POST");
    const { userClient } = await authenticate(request, { requireSelfUser: true });
    const body = await readJson<{ range: string; chiefComplaint?: string }>(request);
    if (!["1_month", "3_months", "6_months"].includes(body?.range) ||
      (body.chiefComplaint !== undefined && typeof body.chiefComplaint !== 'string')) {
      throw new ApiError("VALIDATION_ERROR", "报告参数不正确", 400);
    }
    const { data, error } = await userClient.rpc('get_report_source_snapshot', { target_range: body.range });
    if (error || !data) throw new ApiError("INTERNAL_ERROR", "无法读取完整报告记录，请重试", 500);
    const records = data.records as HealthRecord[];
    const profile = data.profile as Profile;
    const fields = buildReportFields(records);
    const symptoms = records.flatMap(r => r.symptoms ?? []).filter(s => s.occurred !== false);
    const summary = [...new Set(symptoms.map(s => s.symptom))].map(name => {
      const entries = symptoms.filter(s => s.symptom === name);
      return { symptom:name, days:records.filter(r => r.symptoms.some(s => s.symptom === name && s.occurred !== false)).length,
        frequencySummary: frequencySummary(entries.map(s => ({frequency_count:s.frequencyCount}))),
        severityMode:null,trend:null,quotes:entries.map(s => s.quote).filter(Boolean) };
    });
    const chiefComplaint = body.chiefComplaint ?? latestMedicalNeed(records.map(r => ({record_date:r.date,medical_needs:r.medicalNeeds})));
    return json(request, {
      reportId:null, aggregationVersion:'rule-summary-1', generatedAt:data.generatedAt,
      range:data.coverage,
      fields,
      profile:{
        birthYear:profile.birth_year,height:profile.height_cm,menopausalStatus:profile.menopausal_status || null,
        usesMedication:null,chiefComplaint,
        medicalHistory:profile.medical_history,surgeryHistory:profile.surgery_history,
        regularMedications:profile.regular_medications,
        medications: profile.regular_medications ? [{name:profile.regular_medications,status:'资料中填写的长期/规律用药'}] : [],
        allergies:profile.allergy_history ? [profile.allergy_history] : [],
        pregnancyHistory:profile.pregnancy_history || null,familyHistory:profile.family_history || null,
        screenings:profile.screening_history || null,
      },
      // Keep v1 summary keys readable by old clients and existing drafts.
      summary:{menstrual:fields.menstrual.text,symptoms:summary,weight:fields.weight.text,exercise:fields.exercise.text},
      dataWarnings:[],
    });
  } catch (error) { return errorResponse(request,error); }
});
