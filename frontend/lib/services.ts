'use client';

import type { ChatSseEvent, FrontendServices, HealthCategory, HealthDraftItem, HealthRecord, MonthlyHealthStats, MonthlySummary, NavigationTarget, Profile, Recommendation, ReportCoverage, ReportDraft, ReportPreview, ReportRange } from './contracts';
import { currentAccessToken } from './auth';
import { getSupabase } from './supabase';
import { createClientId } from './id';

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';

const recommendations: Recommendation[] = [
  { id: 'walk', category: '走起来', title: '晚饭后散步 15 分钟', description: '不用追求速度，舒服地活动一下' },
  { id: 'sleep', category: '睡得好', title: '睡前给自己十分钟', description: '放下屏幕，做几轮缓慢呼吸' },
  { id: 'mood', category: '心情好', title: '记下一件小小的好事', description: '被看见的日常，也会慢慢积累力量' },
];

const summaries: MonthlySummary[] = [
  {
    id: 'summary-2026-08', month: '2026-08', hasNew: true, generatedAt: '2026-08-29T08:00:00+08:00',
    overview: '这个月你记录得更加稳定。睡眠整体平稳，运动多以散步和八段锦为主。',
    goodThings: ['完成了一次独自短途旅行', '开始每周练习八段锦', '和老朋友重新取得联系'],
    dimensions: [
      { key: 'sleep', title: '我的睡眠', content: '大部分已记录日期睡眠质量为好或一般，夜醒次数较少。' },
      { key: 'hotFlash', title: '我的潮热', content: '记录到的潮热以轻度为主，没有持续上升。' },
      { key: 'mood', title: '我的心情', content: '平静和有力量是这个月较常出现的感受。' },
      { key: 'exercise', title: '我的运动', content: '散步和八段锦构成了主要活动。' },
    ],
  },
  {
    id: 'summary-2026-07', month: '2026-07', hasNew: false, generatedAt: '2026-08-01T08:00:00+08:00',
    overview: '七月的记录较为零散，但已经形成了关注身体变化的开始。', goodThings: ['重新开始晚饭后散步', '和家人坦诚谈了一次感受'],
    dimensions: [{ key: 'mood', title: '我的心情', content: '有波动，也有得到理解后的轻松。' }],
  },
];

let profile: Profile = { id: 'demo-user', userType: 'self_user', birthYear: 1978, heightCm: 165, menopausalStatus: '围绝经期', medicalHistory: '高血压史', surgeryHistory: '无', allergyHistory: '无', regularMedications: '', pregnancyHistory: '', familyHistory: '', screeningHistory: '' };
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' }) as HealthRecord['date'];
const mockRecordStore = new Map<string, HealthRecord>();
const mockDraftDates = new Map<string,string>();
const mockReportDrafts = new Map<string, ReportDraft>();
function mockReportPreview(range: ReportRange): ReportPreview {
  const { startDate, endDate } = mockReportCoverage(range);
  const records = [...mockRecordStore.values()].filter(record => record.date >= startDate && record.date <= endDate).sort((a,b) => b.date.localeCompare(a.date));
  const symptomNames = [...new Set(records.flatMap(record => record.symptoms.filter(item => item.occurred).map(item => item.symptom)))];
  return { reportId: null, range:{startDate,endDate}, profile:{birthYear:profile.birthYear,height:profile.heightCm,menopausalStatus:profile.menopausalStatus||null,usesMedication:Boolean(profile.regularMedications),chiefComplaint:records.find(item=>item.medicalNeeds)?.medicalNeeds ?? '',medicalHistory:profile.medicalHistory,surgeryHistory:profile.surgeryHistory,medications:profile.regularMedications?[{name:profile.regularMedications,status:'长期/规律用药'}]:[],allergies:profile.allergyHistory?[profile.allergyHistory]:[],pregnancyHistory:profile.pregnancyHistory||null,familyHistory:profile.familyHistory||null,screenings:profile.screeningHistory||null},summary:{menstrual:records.some(item=>item.menstrual)?`所选范围内有 ${records.filter(item=>item.menstrual).length} 天月经或出血相关记录。`:'所选范围内暂无月经与出血记录。',symptoms:symptomNames.map(symptom=>({symptom,days:records.filter(record=>record.symptoms.some(item=>item.occurred&&item.symptom===symptom)).length,frequencySummary:'来自健康卡片记录',severityMode:null,trend:null,quotes:[]})),weight:records.some(item=>item.weight)?'所选范围内有体重变化记录。':'所选范围内暂无体重变化记录。',exercise:records.some(item=>item.exercise)?'所选范围内有运动记录。':'所选范围内暂无运动记录。'},dataWarnings:records.length ? (records.length < 7 ? ['记录天数较少，请在就医前核对并补充。'] : []) : ['所选范围内没有健康记录；可继续填写本次就医补充。']};
}
function mockReportCoverage(range: ReportRange): ReportCoverage {
  const endDate = today(); const months = range === '1_month' ? 1 : range === '3_months' ? 3 : 6;
  const [year, month] = endDate.split('-').map(Number);
  const startDate = new Date(Date.UTC(year, month - months - 1, 1)).toISOString().slice(0, 10);
  const totalDays = Math.floor((Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86400000) + 1;
  const recordedDays = [...mockRecordStore.keys()].filter((date) => date >= startDate && date <= endDate).length;
  return { range, startDate, endDate, totalDays, recordedDays, coveragePercent: totalDays ? Math.round((recordedDays / totalDays) * 100) : 0 };
}
type MockReportField = NonNullable<ReportPreview['fields']>[string];
function mockReportFields(): NonNullable<ReportPreview['fields']> {
  // 演示模式的报告字段为写死的假数据，不依赖后端聚合模块，也不参与真实统计口径。
  const sources = (dates: string[]): MockReportField['sources'] => dates.map((date, index) => ({ recordId: `demo-${index + 1}`, recordDate: date, version: 1 }));
  const missing = (): MockReportField => ({ text: '', state: 'missing', sources: [] });
  return {
    menstrual: { text: '所选范围内有 3 天月经或出血相关记录。', details: '2026-09-01：来了，距上次 28 天\n2026-09-02：来了，量多\n2026-09-03：来了，量少', state: 'recorded', sources: sources(['2026-09-01', '2026-09-02', '2026-09-03']) },
    vasomotor: { text: '有 5 天相关记录：程度以轻为主，自述：夜里出汗。', details: '2026-08-28：潮热，程度轻\n2026-09-03：潮热，程度轻，自述：夜里出汗\n2026-09-05：盗汗，程度轻', state: 'recorded', sources: sources(['2026-08-28', '2026-09-03', '2026-09-05']) },
    somatic: { text: '记录头痛 2 天、心悸 1 天。', details: '2026-08-30：头痛，程度轻\n2026-09-04：头痛，程度中\n2026-09-06：心慌，程度轻', state: 'recorded', sources: sources(['2026-08-30', '2026-09-04', '2026-09-06']) },
    genitourinary: missing(),
    otherSymptoms: missing(),
    sleep: { text: '睡眠质量以一般为主，夜醒 1 至 2 次。', details: '2026-08-29：睡眠质量一般，夜醒 2 次\n2026-09-05：睡眠质量好，夜醒 1 次', state: 'recorded', sources: sources(['2026-08-29', '2026-09-05']) },
    mood: { text: '情绪以平静为主，偶有焦虑。', details: '2026-09-02：平静，轻微\n2026-09-04：焦虑，诱因：工作压力', state: 'recorded', sources: sources(['2026-09-02', '2026-09-04']) },
    weight: { text: '有体重变化记录：增加 1kg，速度缓慢。', details: '2026-09-06：增加，1kg，缓慢', state: 'recorded', sources: sources(['2026-09-06']) },
    appetite: { text: '食欲正常 4 天。', state: 'recorded', sources: sources(['2026-09-01', '2026-09-03', '2026-09-05', '2026-09-06']) },
    exercise: { text: '以散步、八段锦为主，每次约 30 分钟。', details: '2026-09-01：散步，30分钟\n2026-09-05：八段锦，40分钟', state: 'recorded', sources: sources(['2026-09-01', '2026-09-05']) },
    lifestyle: { text: '共 3 天相关记录：三餐规律，饮水充足。', state: 'recorded', sources: sources(['2026-09-01', '2026-09-03', '2026-09-05']) },
    medicationHistory: { text: '记录服用钙剂。', details: '2026-09-03：钙剂，服用，当前用药情况待确认', state: 'recorded', sources: sources(['2026-09-03']) },
    lifeImpact: missing(),
    other: missing(),
  };
}
const asText = (value: unknown, fallback = '') => typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? String(value) : fallback;
function mockDate(text:string){const current=today();const iso=text.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);if(iso)return`${iso[1]}-${iso[2].padStart(2,'0')}-${iso[3].padStart(2,'0')}`;const md=text.match(/(\d{1,2})月(\d{1,2})日/);if(md)return`${current.slice(0,4)}-${md[1].padStart(2,'0')}-${md[2].padStart(2,'0')}`;const ago=text.includes('前天')?2:text.includes('昨天')?1:0;if(ago){const date=new Date(`${current}T00:00:00Z`);date.setUTCDate(date.getUTCDate()-ago);return date.toISOString().slice(0,10)}return current}
function mockDatedTexts(text:string){const markers=[...text.matchAll(/\b20\d{2}-\d{1,2}-\d{1,2}\b|\d{1,2}月\d{1,2}日|前天|昨天|今天/g)];if(!markers.length)return[{date:mockDate(text),text}];return markers.map((marker,index)=>({date:mockDate(marker[0]),text:text.slice(marker.index,markers[index+1]?.index??text.length)}));}

function mockHealthItems(text: string): HealthDraftItem[] {
  const items: HealthDraftItem[] = [];
  const push = (category: string, data: Record<string, unknown> | string) => items.push({
    clientItemId: createClientId(), category, operation: 'create', data, quote: text.slice(0, 100), confidence: .82,
  });
  const symptom = [['潮热','潮热'],['头痛','头痛'],['心悸','心慌'],['盗汗','夜里出汗'],['头晕','头晕']].find(([,word])=>text.includes(word));
  if(symptom) push('symptom',{symptom:symptom[0],occurred:!/(没有|没再|不再)/.test(text),severity:/严重|受不了/.test(text)?'重':/有点|轻微/.test(text)?'轻':undefined,frequencyCount:Number(text.match(/(\d+)\s*次/)?.[1])||undefined});
  if(/睡不着|睡不好|失眠|夜醒|醒了|睡眠/.test(text)) push('sleep',{quality:/睡不着|睡不好|失眠/.test(text)?'差':'一般',nightWakes:Number(text.match(/(?:醒|夜醒)(?:了)?\s*(\d+)\s*次/)?.[1])||undefined,detail:text.slice(0,80)});
  const mood=[['舒展',['舒展','轻松','开心','自在']],['平静',['平静','安稳','还好']],['低落',['低落','想哭','难过','孤独']],['焦虑',['焦虑','担心','不安']],['烦躁',['烦躁','心烦','烦闷']]] as const;
  const matchedMood=mood.find(([,words])=>words.some(word=>text.includes(word)));
  if(matchedMood){const keyword=matchedMood[1].find(word=>text.includes(word))??matchedMood[0];push('mood',{state:matchedMood[0],description:keyword,source:'ai',confidence:.85});}
  if(/想去医院|想找医生|就医/.test(text)) push('medicalNeed',text.slice(0,200));
  return items;
}

function mockNavigation(text: string): {target:NavigationTarget;params?:Record<string,string>} | null {
  if(/报告|导出给医生/.test(text)) return {target:'reportExport'};
  if(/月度总结|这个月总结/.test(text)) return {target:'monthlySummary'};
  if(/月历|曲线|这个月的(睡眠|潮热|心情|运动)|月度记录/.test(text)) return {target:'monthlyRecords'};
  if(/健康卡片|今日记录|修改.*(?:昨天|\d{1,2}月\d{1,2}日).*(?:记录|卡片)/.test(text)) return {target:'healthCard',params:{date:mockDate(text)}};
  if(/个人资料|我的资料|填写.*(?:出生年份|既往病史|手术史)/.test(text)){
    const params:Record<string,string>={};const birth=text.match(/出生年份[^\d]*((?:19|20)\d{2})/);const history=text.match(/既往病史[^：:，。]*[：:]?\s*([^，。]+)/);const surgery=text.match(/手术史[^：:，。]*[：:]?\s*([^，。]+)/);
    if(birth)params.birthYear=birth[1];if(history)params.medicalHistory=history[1];if(surgery)params.surgeryHistory=surgery[1];return{target:'profile',params};
  }
  if(/行动|运动建议/.test(text)) return {target:'exerciseToday'};
  return null;
}

const mockServices: FrontendServices = {
  recommendations: { async getToday() { await wait(180); return recommendations; } },
  chat: {
    async *stream(text, clientMessageId, _conversationId, signal): AsyncIterable<ChatSseEvent> {
      yield { type: 'message_started', data: { conversationId: 'demo-conversation', clientMessageId } };
      const normalized = text.trim();
      const healthSegments=mockDatedTexts(normalized).map(segment=>({...segment,items:mockHealthItems(segment.text)}));
      const healthItems = healthSegments.flatMap(segment=>segment.items);
      const navigation = mockNavigation(normalized);
      if(navigation) yield { type:'navigation', data:navigation };
      const healthSignal = healthItems.length > 0;
      const answer = healthSignal
        ? '听起来这几天的睡眠让你有些疲惫。我们可以先把发生的情况记清楚，不急着给自己下结论。你愿意说说昨晚大约几点睡、醒了几次吗？'
        : '谢谢你愿意把这些告诉我。你的感受值得被认真对待，我们可以从最困扰你的那一点慢慢说起。';
      for (const sentence of answer.match(/[^。！？]*[。！？]?/g)?.filter(Boolean) ?? [answer]) {
        if (signal.aborted) return;
        await wait(220);
        yield { type: 'text_delta', data: { delta: sentence } };
      }
      if (healthSignal) for(const segment of healthSegments){if(!segment.items.length)continue;const draftId=createClientId();mockDraftDates.set(draftId,segment.date);await mockServices.healthCard.confirm(draftId,segment.items,createClientId());yield { type: 'health_card_updated', data: { recordDate:segment.date as HealthRecord['date'], items:segment.items, savedItemCount:segment.items.length } };}
      yield { type: 'message_completed', data: { messageId: createClientId(), speakableText: answer } };
    },
  },
  healthCard: {
    async confirm(draftId, selectedItems, _idempotencyKey) {
      await wait(120);
      const date=mockDraftDates.get(draftId)??today();
      const existing:HealthRecord=mockRecordStore.get(date)??{date:date as HealthRecord['date'],symptoms:[],medications:[],lifeEvents:[]};
      for(const item of selectedItems){
        if(item.category==='symptom'&&item.data&&typeof item.data==='object')existing.symptoms.push(item.data as HealthRecord['symptoms'][number]);
        else if(item.category==='sleep'&&item.data&&typeof item.data==='object')existing.sleep=item.data as HealthRecord['sleep'];
        else if(item.category==='mood'&&item.data&&typeof item.data==='object')existing.mood=item.data as HealthRecord['mood'];
        else if(item.category==='medicalNeed'&&typeof item.data==='string')existing.medicalNeeds=item.data;
      }
      mockRecordStore.set(date,structuredClone(existing));
      return { savedItemCount: selectedItems.length };
    },
  },
  healthRecords: {
    async list(){return [...mockRecordStore.keys()].sort().reverse().map(date=>({date:date as HealthRecord['date'],updatedAt:new Date().toISOString()}));},
    async get(date){return structuredClone(mockRecordStore.get(date)??null);},
    async save(date,record,expectedVersion,_categories){const existing=mockRecordStore.get(date);if((existing?.version??0)!==expectedVersion)throw new Error('RECORD_VERSION_CONFLICT');const version=expectedVersion+1;mockRecordStore.set(date,structuredClone({...record,date:date as HealthRecord['date'],version}));return{recordId:record.id??createClientId(),recordDate:date,version};},
    async monthly(month){const [year,monthNumber]=month.split('-').map(Number);const total=new Date(year,monthNumber,0).getDate();const days=Array.from({length:total},(_,index)=>{const date=`${month}-${String(index+1).padStart(2,'0')}` as HealthRecord['date'];const record=mockRecordStore.get(date);const hotFlash=record?.symptoms.find(item=>item.symptom==='潮热');return{date,hasRecord:Boolean(record),sleep:record?.sleep??null,hotFlash:hotFlash??null,mood:record?.mood??null,exercise:record?.exercise??null}});return{month:month as MonthlyHealthStats['month'],days,digest:{text:`本月已记录 ${days.filter(day=>day.hasRecord).length} 天。`,highlights:[]}};},
  },
  speech: {
    async transcribe(){await wait(250);return '昨晚睡得不太好，夜里醒了两次。';},
    async synthesize(){return null;},
  },
  profile: {
    async get() { await wait(160); return profile; },
    async update(input) { await wait(260); profile = { ...profile, ...input }; return profile; },
  },
  rephrase: {
    async rephrase(text,options) { await wait(450); const audience=options?.audience&&options.audience!=='不指定'?`和${options.audience}`:'认真';return `我想${audience}说说心里的感受：${text.trim()}。我希望你能理解我此刻的心情，也愿意听我把话说完。`; },
  },
  summaries: {
    async list() { await wait(180); return summaries; },
    async get(month) { await wait(180); return summaries.find((item) => item.month === month) ?? summaries[0]; },
  },
  reports: {
    async preview(range) { await wait(220); const preview=mockReportPreview(range); return {...preview,aggregationVersion:'mock-static-1',generatedAt:new Date().toISOString(),fields:mockReportFields()}; },
    async coverage(range) { await wait(120); return mockReportCoverage(range); },
    async saveDraft(input) { await wait(160); const id=input.id ?? createClientId(); const draft:ReportDraft={id,range:input.range,snapshot:structuredClone(input.snapshot),overrides:structuredClone(input.overrides),status:'draft',updatedAt:new Date().toISOString()}; mockReportDrafts.set(id,draft); return structuredClone(draft); },
  },
};

function edgeUrl(path: string) {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) throw new Error('SUPABASE_NOT_CONFIGURED');
  return `${base.replace(/\/$/, '')}/functions/v1/${path}`;
}

async function authHeaders(): Promise<Record<string, string>> {
  const token = await currentAccessToken();
  if (!token) throw new Error('NOT_AUTHENTICATED');
  return { apikey: PUBLISHABLE_KEY, Authorization: `Bearer ${token}` };
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set('Content-Type', 'application/json');
  for (const [name,value] of Object.entries(await authHeaders())) headers.set(name,value);
  const response = await fetch(edgeUrl(path), {
    ...init,
    headers,
  });
  if (!response.ok) throw new Error(`REQUEST_FAILED_${response.status}`);
  return response.json() as Promise<T>;
}

function mapSseEvent(event: string, data: Record<string, unknown>): ChatSseEvent | null {
  switch (event) {
    case 'message_started':
      return { type: 'message_started', data: { conversationId: asText(data.conversationId), clientMessageId: asText(data.clientMessageId) } };
    case 'text_delta':
      return { type: 'text_delta', data: { delta: asText(data.delta) } };
    case 'tool_status':
      return { type: 'tool_status', data: { name: asText(data.name), status: data.status === 'done' ? 'done' : 'running' } };
    case 'navigation':
      return { type:'navigation', data:{target:asText(data.target,'healthCard') as NavigationTarget, params:data.params&&typeof data.params==='object'?data.params as Record<string,string>:undefined} };
    case 'rag_sources':
      return { type:'rag_sources', data:{sources:Array.isArray(data.sources)?data.sources as Array<{title:string;sourceUrl?:string;publisher?:string}>:[]} };
    case 'health_card_updated':
      return {
        type:'health_card_updated',
        data:{
          recordDate:asText(data.recordDate) as `${number}-${number}-${number}`,
          items:Array.isArray(data.items)?data.items as HealthDraftItem[]:[],
          savedItemCount:Number(data.savedItemCount)||0,
        },
      };
    case 'health_card_update_failed':
      return {type:'health_card_update_failed',data:{recordDate:asText(data.recordDate) as `${number}-${number}-${number}`,message:asText(data.message,'健康卡片自动更新失败')}};
    case 'health_card_preview':
      return {
        type: 'health_card_preview',
        data: {
          draftId: asText(data.draftId),
          recordDate: asText(data.recordDate) as `${number}-${number}-${number}`,
          items: Array.isArray(data.items) ? (data.items as HealthDraftItem[]) : undefined,
        },
      };
    case 'message_completed':
      return { type: 'message_completed', data: { messageId: asText(data.messageId), speakableText: asText(data.speakableText) } };
    case 'safety_alert':
      return { type: 'safety_alert', data: { level: 'urgent', message: asText(data.message) } };
    case 'error':
      return { type: 'error', data: { code: asText(data.code,'UNKNOWN'), message: asText(data.message), retryable: Boolean(data.retryable) } };
    default:
      return null; // rag_sources / navigation 等事件暂不在 MVP 前端消费
  }
}

const realServices: FrontendServices = {
  recommendations: {
    async getToday() {
      const value = await requestJson<{ items: Recommendation[] }>('recommendations');
      return Array.isArray(value?.items) ? value.items : [];
    },
  },
  chat: {
    async *stream(text, clientMessageId, conversationId, signal): AsyncIterable<ChatSseEvent> {
      const response = await fetch(edgeUrl('chat'), {
        method: 'POST',
        signal,
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ conversationId, clientMessageId, text }),
      });
      if (!response.ok || !response.body) {
        const body = await response.text().catch(() => '');
        throw new Error(`CHAT_FAILED_${response.status} ${body.slice(0, 120)}`);
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const blocks = buffer.split('\n\n');
        buffer = blocks.pop() ?? '';
        for (const block of blocks) {
          let event = 'message';
          let data: unknown = null;
          for (const line of block.split('\n')) {
            if (line.startsWith('event:')) event = line.slice(6).trim();
            else if (line.startsWith('data:')) {
              const payload = line.slice(5).trim();
              try { data = JSON.parse(payload); } catch { data = payload; }
            }
          }
          if (data === null || typeof data !== 'object') continue;
          const mapped = mapSseEvent(event, data as Record<string, unknown>);
          if (mapped) yield mapped;
        }
      }
    },
  },
  healthCard: {
    async confirm(draftId, selectedItems, idempotencyKey) {
      const value = await requestJson<{ savedItemCount: number }>('health-card-confirm', {
        method: 'POST',
        headers: { 'idempotency-key': idempotencyKey },
        body: JSON.stringify({
          draftId,
          selectedItems: selectedItems.map((item) => ({
            clientItemId: item.clientItemId,
            operation: item.operation,
            ...(item.targetRecordId ? { targetRecordId: item.targetRecordId } : {}),
            data: item.data,
          })),
        }),
      });
      return { savedItemCount: value?.savedItemCount ?? selectedItems.length };
    },
  },
  healthRecords: {
    async list(){
      const client=getSupabase();
      const {data,error}=await client.from('health_records').select('record_date,updated_at').order('record_date',{ascending:false}).limit(2200);
      if(error)throw new Error(`HEALTH_LIST_FAILED ${error.message}`);
      return (data??[]).map(row=>({date:String(row.record_date) as HealthRecord['date'],updatedAt:String(row.updated_at)}));
    },
    async get(date){
      const client=getSupabase();
      const {data,error}=await client.rpc('get_health_record',{target_date:date});
      if(error)throw new Error(`HEALTH_GET_FAILED ${error.message}`);
      return (data?.record??null) as HealthRecord|null;
    },
    async save(date,record,expectedVersion,categories:HealthCategory[]){
      const client=getSupabase();
      const {data,error}=await client.rpc('patch_health_record',{target_date:date,expected_version:expectedVersion,payload:record,categories});
      if(error)throw new Error(error.message.includes('RECORD_VERSION_CONFLICT')?'RECORD_VERSION_CONFLICT':`HEALTH_SAVE_FAILED ${error.message}`);
      return {recordId:String(data.recordId??''),recordDate:String(data.recordDate??date),version:Number(data.version??expectedVersion+1)};
    },
    async monthly(month){
      const client=getSupabase();const {data,error}=await client.rpc('get_monthly_stats',{target_month:month});
      if(error)throw new Error(`MONTHLY_STATS_FAILED ${error.message}`);return data as MonthlyHealthStats;
    },
  },
  speech: {
    async transcribe(audio,durationMs,clientRequestId){
      const form=new FormData();form.append('audio',audio,'recording.webm');form.append('durationMs',String(durationMs));form.append('clientRequestId',clientRequestId);
      const response=await fetch(edgeUrl('speech-asr'),{method:'POST',headers:await authHeaders(),body:form});
      if(!response.ok)throw new Error(`ASR_FAILED_${response.status}`);
      const value=await response.json() as {text?:string};return String(value.text??'');
    },
    async synthesize(messageId,text){
      const response=await fetch(edgeUrl('speech-tts'),{method:'POST',headers:{'Content-Type':'application/json',...(await authHeaders())},body:JSON.stringify({messageId,text})});
      if(!response.ok)throw new Error(`TTS_FAILED_${response.status}`);return response.blob();
    },
  },
  profile: {
    async get() {
      const client = getSupabase();
      const { data: authData } = await client.auth.getUser();
      const userId = authData.user?.id;
      if (!userId) throw new Error('NOT_AUTHENTICATED');
      const { data, error } = await client
        .from('profiles')
        .select('id,user_type,birth_year,height_cm,menopausal_status,medical_history,surgery_history,allergy_history,regular_medications,pregnancy_history,family_history,screening_history')
        .eq('id', userId)
        .maybeSingle();
      if (error) throw new Error(`PROFILE_FAILED ${error.message}`);
      if (!data) return { id: userId, userType: 'self_user', birthYear: null, heightCm: null, menopausalStatus: '', medicalHistory: '', surgeryHistory: '', allergyHistory: '', regularMedications: '', pregnancyHistory: '', familyHistory: '', screeningHistory: '' };
      return {
        id: data.id, userType: (data.user_type ?? 'self_user') as 'self_user' | 'supporter',
        birthYear: data.birth_year, heightCm: data.height_cm, menopausalStatus: data.menopausal_status ?? '', medicalHistory: data.medical_history ?? '', surgeryHistory: data.surgery_history ?? '', allergyHistory: data.allergy_history ?? '', regularMedications: data.regular_medications ?? '', pregnancyHistory: data.pregnancy_history ?? '', familyHistory: data.family_history ?? '', screeningHistory: data.screening_history ?? '',
      };
    },
    async update(input) {
      const client = getSupabase();
      const { data: authData } = await client.auth.getUser();
      const userId = authData.user?.id;
      if (!userId) throw new Error('NOT_AUTHENTICATED');
      const { data, error } = await client
        .from('profiles')
        .update({ birth_year: input.birthYear, height_cm: input.heightCm, menopausal_status: input.menopausalStatus, medical_history: input.medicalHistory, surgery_history: input.surgeryHistory, allergy_history: input.allergyHistory, regular_medications: input.regularMedications, pregnancy_history: input.pregnancyHistory, family_history: input.familyHistory, screening_history: input.screeningHistory })
        .eq('id', userId)
        .select('id,user_type,birth_year,height_cm,menopausal_status,medical_history,surgery_history,allergy_history,regular_medications,pregnancy_history,family_history,screening_history')
        .single();
      if (error || !data) throw new Error(`PROFILE_UPDATE_FAILED ${error?.message ?? ''}`);
      return {
        id: data.id, userType: (data.user_type ?? 'self_user') as 'self_user' | 'supporter',
        birthYear: data.birth_year, heightCm: data.height_cm, menopausalStatus: data.menopausal_status ?? '', medicalHistory: data.medical_history ?? '', surgeryHistory: data.surgery_history ?? '', allergyHistory: data.allergy_history ?? '', regularMedications: data.regular_medications ?? '', pregnancyHistory: data.pregnancy_history ?? '', familyHistory: data.family_history ?? '', screeningHistory: data.screening_history ?? '',
      };
    },
  },
  rephrase: {
    async rephrase(text,options) {
      const value = await requestJson<{ text: string }>('ai-rephrase', { method: 'POST', body: JSON.stringify({ clientRequestId: createClientId(), text, style: 'warm', audience: options?.audience }) });
      return value.text;
    },
  },
  summaries: {
    async list() { await wait(180); return summaries; }, // MVP 无列表接口，沿用演示数据（已确认）
    async get(month) {
      const value = await requestJson<MonthlySummary>('monthly-summary', { method: 'POST', body: JSON.stringify({ month }) });
      return {
        ...value,
        dimensions: (value?.dimensions ?? []).map((dim) => ({
          key: String(dim.key ?? ''), title: String(dim.title ?? dim.key ?? ''), content: String(dim.content ?? ''),
        })),
      };
    },
  },
  reports: {
    async preview(range, chiefComplaint) { return requestJson<ReportPreview>('report-preview',{method:'POST',body:JSON.stringify({range,chiefComplaint})}); },
    async coverage(range) {
      const client=getSupabase();
      const {data,error}=await client.rpc('get_report_coverage_for_range',{target_range:range});
      if(error || !data) throw new Error(`REPORT_COVERAGE_FAILED ${error?.message ?? ''}`);
      return { range:data.range as ReportRange, startDate:String(data.startDate), endDate:String(data.endDate), totalDays:Number(data.totalDays), recordedDays:Number(data.recordedDays), coveragePercent:Number(data.coveragePercent) };
    },
    async saveDraft(input) {
      const client=getSupabase(); const {data:authData}=await client.auth.getUser(); const userId=authData.user?.id;
      if(!userId) throw new Error('NOT_AUTHENTICATED');
      const payload={user_id:userId,range:input.range,snapshot:input.snapshot,overrides:input.overrides,status:'draft'};
      const query=input.id ? client.from('medical_report_drafts').update(payload).eq('id',input.id) : client.from('medical_report_drafts').insert(payload);
      const {data,error}=await query.select('id,range,snapshot,overrides,status,updated_at').single();
      if(error||!data) throw new Error(`REPORT_DRAFT_SAVE_FAILED ${error?.message??''}`);
      return {id:String(data.id),range:data.range as ReportRange,snapshot:data.snapshot as ReportPreview,overrides:(data.overrides??{}) as Record<string,string>,status:data.status as 'draft'|'exported',updatedAt:String(data.updated_at)};
    },
  },
};

export const services = process.env.NEXT_PUBLIC_USE_MOCKS === 'true' ? mockServices : realServices;
