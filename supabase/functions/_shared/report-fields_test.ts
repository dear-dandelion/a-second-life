import { buildReportFields } from './report-fields.ts';
import type { ReportHealthRecord as HealthRecord } from './report-fields.ts';
function assert(value: unknown) { if(!value) throw new Error('Assertion failed'); }
Deno.test('字段带入保留日期、零值、否认和原始记录，空字段不生成正常', () => {
  const records: HealthRecord[] = [{id:'a',date:'2026-09-01',version:3,symptoms:[{symptom:'潮热',occurred:true,frequencyCount:2},{symptom:'胸闷',occurred:false}],sleep:{quality:'差',nightWakes:0},mood:{state:'焦虑',intensity:'明显'},appetite:'减少',medications:[{name:'药A',action:'漏服'}]}];
  const before=JSON.stringify(records);
  const result=buildReportFields(records);
  assert(result.sleep.text.includes('2026-09-01') && result.sleep.text.includes('夜醒0次'));
  assert(result.mood.text.includes('焦虑'));
  assert(result.somatic.details?.includes('2026-09-01：明确记录无胸闷'));
  assert(result.vasomotor.text.includes('未折算日频次'));
  assert(result.medicationHistory.text.includes('漏服') && !result.medicationHistory.text.includes('服用中'));
  assert(result.genitourinary.text === '' && result.genitourinary.state === 'missing');
  assert(result.sleep.sources[0].recordId==='a' && result.sleep.sources[0].version===3);
  assert(JSON.stringify(records)===before);
});
Deno.test('乱序、重复及同日冲突不丢失事实、不合并为频次或持续病程', () => {
  const records:HealthRecord[]=[{date:'2026-09-07',symptoms:[{symptom:'感冒',occurred:true}]},{date:'2026-08-01',symptoms:[{symptom:'潮热',occurred:true},{symptom:'潮热',occurred:true},{symptom:'潮热',occurred:false}],menstrual:{event:'来了'}}];
  const fields=buildReportFields(records);
  assert(fields.vasomotor.details?.split('\n').length===2);
  assert(fields.vasomotor.text.includes('需核对'));
  assert(fields.vasomotor.sources.length===1);
  assert(fields.otherSymptoms.text.includes('感冒'));
  assert(!fields.menstrual.text.includes('次月经'));
  assert(buildReportFields([]).sleep.text==='');
});
