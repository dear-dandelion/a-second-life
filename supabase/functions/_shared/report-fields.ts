import { summarizeReport, isTestSymptom } from './report-summary.ts';
export interface ReportHealthRecord {
  id?: string; date: string; version?: number;
  symptoms: Array<{symptom:string;occurred:boolean;frequencyCount?:number;frequency?:string;severity?:string;trend?:string;trigger?:string;quote?:string}>;
  menstrual?: Record<string,unknown>; sleep?: Record<string,unknown>; mood?: Record<string,unknown>;
  weight?: Record<string,unknown>; exercise?: Record<string,unknown>; diet?: Record<string,unknown>;
  medications?: Array<Record<string,unknown>>; lifeEvents?: Array<Record<string,unknown>>;
  appetite?: string; other?: string;
}

export interface ReportField {
  text: string;
  details?: string;
  notice?: string;
  state: 'recorded' | 'missing';
  sources: Array<{ recordId: string; recordDate: string; version: number }>;
}
const text = (v: unknown) => v === null || v === undefined ? '' : String(v);
const join = (parts: unknown[]) => parts.map(text).filter(Boolean).join('，');

/** Deterministic, date-scoped observations; never infers absence or duration. */
export function buildReportFields(records: ReportHealthRecord[]): Record<string, ReportField> {
  const keys = ['menstrual','vasomotor','somatic','genitourinary','otherSymptoms','sleep','mood','weight','appetite','exercise','lifestyle','medicationHistory','lifeImpact','other'];
  const result = Object.fromEntries(keys.map(key => [key, {text:'',state:'missing',sources:[]}])) as Record<string, ReportField>;
  const add = (key: string, record: ReportHealthRecord, value: string) => {
    if (!value) return;
    const field = result[key];
    const line = `${record.date}：${value}`;
    if (!field.text.split('\n').includes(line)) field.text += (field.text ? '\n' : '') + line;
    field.state = 'recorded';
    if (!field.sources.some(s => s.recordDate === record.date)) field.sources.push({recordId: record.id ?? '',recordDate:record.date,version:record.version ?? 0});
  };
  for (const r of [...records].sort((a,b) => a.date.localeCompare(b.date))) {
    for (const s of r.symptoms ?? []) {
      const key = /潮热|出汗|盗汗/.test(s.symptom) ? 'vasomotor'
        : /尿频|尿急|漏尿|尿失禁|阴道|干涩|同房|性生活/.test(s.symptom) ? 'genitourinary'
        : /头晕|眩晕|头痛|心悸|心慌|疲|乏|关节|肌肉|酸痛|胸闷|气短|蚁走/.test(s.symptom) ? 'somatic' : 'otherSymptoms';
      const count = typeof s.frequencyCount === 'number' && Number.isInteger(s.frequencyCount) && s.frequencyCount >= 0 ? `原记录次数${s.frequencyCount}次（未折算日频次）` : '';
      add(key,r,s.occurred === false ? `明确记录无${s.symptom}` : join([s.symptom,s.severity ? `程度${s.severity}` : '',s.frequency,count,s.trend ? `自述${s.trend}` : '',s.trigger ? `诱因：${s.trigger}` : '',s.quote ? `自述：${s.quote}` : '']));
    }
    if(r.menstrual) add('menstrual',r,join([r.menstrual.event,r.menstrual.daysSinceLast !== undefined ? `自述距上次${r.menstrual.daysSinceLast}天` : '',r.menstrual.note]));
    if(r.sleep) add('sleep',r,join([r.sleep.quality ? `睡眠质量${r.sleep.quality}` : '',r.sleep.bedtime ? `就寝${r.sleep.bedtime}` : '',r.sleep.wakeTime ? `起床${r.sleep.wakeTime}` : '',typeof r.sleep.nightWakes === 'number' ? `夜醒${r.sleep.nightWakes}次` : '',r.sleep.detail]));
    if(r.mood) add('mood',r,join([r.mood.state,r.mood.intensity,r.mood.description,r.mood.trigger ? `诱因：${r.mood.trigger}` : '']));
    if(r.weight) add('weight',r,join([`体重${text(r.weight.direction)}${text(r.weight.amount)}`,r.weight.speed]));
    add('appetite',r,r.appetite ? `食欲${r.appetite}` : '');
    if(r.exercise) add('exercise',r,join([r.exercise.type,r.exercise.duration,r.exercise.frequency,r.exercise.intensity]));
    if(r.diet) add('lifestyle',r,join([typeof r.diet.mealsRegular === 'boolean' ? (r.diet.mealsRegular ? '三餐规律' : '三餐不规律') : '',Array.isArray(r.diet.foods) ? r.diet.foods.join('、') : '',r.diet.water ? `饮水${r.diet.water}` : '',r.diet.caffeine ? `咖啡因：${r.diet.caffeine}` : '',r.diet.alcohol ? `饮酒：${r.diet.alcohol}` : '',typeof r.diet.smoking === 'boolean' ? (r.diet.smoking ? '记录吸烟' : '记录不吸烟') : '']));
    for(const m of r.medications ?? []) add('medicationHistory',r,join([m.name,m.action,'当前用药情况待确认']));
    for(const e of r.lifeEvents ?? []) add('lifeImpact',r,join([e.category,e.description,e.impact]));
    add('other',r,r.other ?? '');
  }
  for (const [key,field] of Object.entries(result)) {
    field.details = field.text;
    const summary = summarizeReport(records,key);
    if (['vasomotor','somatic','genitourinary','otherSymptoms','sleep','mood','exercise','menstrual','weight','appetite','medicationHistory'].includes(key)) {
      field.text = summary;
    } else if(field.text) {
      // Repeated lifestyle/free-text descriptions collapse into a few observations.
      const lines=field.text.split('\n');
      const observations=[...new Set(lines.map(line=>line.slice(12)))];
      field.text=`共${field.sources.length}天相关记录：${observations.slice(0,2).join('；')}。${observations.length>2?'其余内容见来源记录。':''}`;
    }
    field.state=field.text?'recorded':'missing';
  }
  if(records.some(r=>r.symptoms.some(isTestSymptom))) {
    result.vasomotor.notice='检测到明确标注的测试症状记录，未纳入摘要。其他记录来源请核对后用于就医。';
  }
  return result;
}
