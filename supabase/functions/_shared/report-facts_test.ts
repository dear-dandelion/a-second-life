import { frequencySummary, medicationObservation, latestMedicalNeed } from './report-facts.ts';
function equal(actual: unknown, expected: unknown) {
  if (actual !== expected) throw new Error(`Expected ${expected}, got ${actual}`);
}
Deno.test('报告次数缺失不转为零，不将条目平均数描述成每日频次', () => {
  equal(frequencySummary([{frequency_count:null}, {}, {frequency_count:''}]), '未记录明确发作次数');
  equal(frequencySummary([{frequency_count:null}, {frequency_count:2}, {frequency_count:4}]), '2 条有明确次数的记录：2—4 次（按原记录，未折算每日频次）');
  equal(frequencySummary([{frequency_count:0}]), '1 条有明确次数的记录：0—0 次（按原记录，未折算每日频次）');
});
Deno.test('漏服和历史服用不推断当前服药状态', () => {
  equal(medicationObservation('漏服','2026-09-02'), '2026-09-02 记录漏服；当前用药情况待确认');
  equal(medicationObservation('服用','2026-08-12'), '2026-08-12 记录服用；当前用药情况待确认');
});
Deno.test('就医诉求取最近非空值且不更改原始顺序', () => {
  const records = [{record_date:'2026-08-01',medical_needs:'旧诉求'}, {record_date:'2026-09-01',medical_needs:'新诉求'}, {record_date:'2026-09-07',medical_needs:' '}];
  equal(latestMedicalNeed(records), '新诉求');
  equal(records[0].medical_needs, '旧诉求');
});
