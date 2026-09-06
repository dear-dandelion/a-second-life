'use client';

import type { ChatSseEvent, FrontendServices, HealthDraftItem, HealthRecord, MonthlyHealthStats, MonthlySummary, NavigationTarget, Profile, Recommendation } from './contracts';
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
const asText = (value: unknown, fallback = '') => typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? String(value) : fallback;
function mockDate(text:string){const current=today();const iso=text.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);if(iso)return`${iso[1]}-${iso[2].padStart(2,'0')}-${iso[3].padStart(2,'0')}`;const md=text.match(/(\d{1,2})月(\d{1,2})日/);if(md)return`${current.slice(0,4)}-${md[1].padStart(2,'0')}-${md[2].padStart(2,'0')}`;if(text.includes('昨天')){const date=new Date(`${current}T00:00:00Z`);date.setUTCDate(date.getUTCDate()-1);return date.toISOString().slice(0,10)}return current}

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
      const healthItems = mockHealthItems(normalized);
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
      if (healthSignal) {const draftId=createClientId();const recordDate=mockDate(text);mockDraftDates.set(draftId,recordDate);await mockServices.healthCard.confirm(draftId,healthItems,createClientId());yield { type: 'health_card_updated', data: { recordDate:recordDate as HealthRecord['date'], items:healthItems, savedItemCount:healthItems.length } };}
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
    async save(date,record){mockRecordStore.set(date,structuredClone({...record,date:date as HealthRecord['date']}));return{recordId:record.id??createClientId(),recordDate:date};},
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
      const {data,error}=await client.from('health_records').select('record_date,updated_at').order('record_date',{ascending:false}).limit(180);
      if(error)throw new Error(`HEALTH_LIST_FAILED ${error.message}`);
      return (data??[]).map(row=>({date:String(row.record_date) as HealthRecord['date'],updatedAt:String(row.updated_at)}));
    },
    async get(date){
      const client=getSupabase();
      const {data,error}=await client.rpc('get_health_record',{target_date:date});
      if(error)throw new Error(`HEALTH_GET_FAILED ${error.message}`);
      return (data?.record??null) as HealthRecord|null;
    },
    async save(date,record){
      const client=getSupabase();
      const {data,error}=await client.rpc('save_health_record',{target_date:date,payload:record});
      if(error)throw new Error(`HEALTH_SAVE_FAILED ${error.message}`);
      return {recordId:String(data.recordId??''),recordDate:String(data.recordDate??date)};
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
};

export const services = process.env.NEXT_PUBLIC_USE_MOCKS === 'true' ? mockServices : realServices;
