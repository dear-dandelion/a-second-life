'use client';

import type { ChatSseEvent, FrontendServices, HealthDraftItem, MonthlySummary, Profile, Recommendation } from './contracts';
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

let profile: Profile = { id: 'demo-user', userType: 'self_user', birthYear: 1978, medicalHistory: '高血压史', surgeryHistory: '无' };

const mockServices: FrontendServices = {
  recommendations: { async getToday() { await wait(180); return recommendations; } },
  chat: {
    async *stream(text, clientMessageId, _conversationId, signal): AsyncIterable<ChatSseEvent> {
      yield { type: 'message_started', data: { conversationId: 'demo-conversation', clientMessageId } };
      const normalized = text.trim();
      const healthSignal = /睡|潮热|心情|头痛|不舒服|焦虑/.test(normalized);
      const answer = healthSignal
        ? '听起来这几天的睡眠让你有些疲惫。我们可以先把发生的情况记清楚，不急着给自己下结论。你愿意说说昨晚大约几点睡、醒了几次吗？'
        : '谢谢你愿意把这些告诉我。你的感受值得被认真对待，我们可以从最困扰你的那一点慢慢说起。';
      for (const sentence of answer.match(/[^。！？]*[。！？]?/g)?.filter(Boolean) ?? [answer]) {
        if (signal.aborted) return;
        await wait(220);
        yield { type: 'text_delta', data: { delta: sentence } };
      }
      if (healthSignal) yield { type: 'health_card_preview', data: { draftId: createClientId(), recordDate: '2026-08-29' } };
      yield { type: 'message_completed', data: { messageId: createClientId(), speakableText: answer } };
    },
  },
  healthCard: {
    async confirm(_draftId, selectedItems, _idempotencyKey) { await wait(260); return { savedItemCount: selectedItems.length }; },
  },
  profile: {
    async get() { await wait(160); return profile; },
    async update(input) { await wait(260); profile = { ...profile, ...input }; return profile; },
  },
  rephrase: {
    async rephrase(text) { await wait(450); return `我想认真和你说说最近的感受：${text.trim()}。我不是在责怪谁，只是希望自己的需要也能被听见。`; },
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
  const response = await fetch(edgeUrl(path), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()), ...(init?.headers ?? {}) },
  });
  if (!response.ok) throw new Error(`REQUEST_FAILED_${response.status}`);
  return response.json() as Promise<T>;
}

function mapSseEvent(event: string, data: Record<string, unknown>): ChatSseEvent | null {
  switch (event) {
    case 'message_started':
      return { type: 'message_started', data: { conversationId: String(data.conversationId ?? ''), clientMessageId: String(data.clientMessageId ?? '') } };
    case 'text_delta':
      return { type: 'text_delta', data: { delta: String(data.delta ?? '') } };
    case 'tool_status':
      return { type: 'tool_status', data: { name: String(data.name ?? ''), status: data.status === 'done' ? 'done' : 'running' } };
    case 'health_card_preview':
      return {
        type: 'health_card_preview',
        data: {
          draftId: String(data.draftId ?? ''),
          recordDate: String(data.recordDate ?? '') as `${number}-${number}-${number}`,
          items: Array.isArray(data.items) ? (data.items as HealthDraftItem[]) : undefined,
        },
      };
    case 'message_completed':
      return { type: 'message_completed', data: { messageId: String(data.messageId ?? ''), speakableText: String(data.speakableText ?? '') } };
    case 'safety_alert':
      return { type: 'safety_alert', data: { level: 'urgent', message: String(data.message ?? '') } };
    case 'error':
      return { type: 'error', data: { code: String(data.code ?? 'UNKNOWN'), message: String(data.message ?? ''), retryable: Boolean(data.retryable) } };
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
  profile: {
    async get() {
      const client = getSupabase();
      const { data: authData } = await client.auth.getUser();
      const userId = authData.user?.id;
      if (!userId) throw new Error('NOT_AUTHENTICATED');
      const { data, error } = await client
        .from('profiles')
        .select('id,user_type,birth_year,medical_history,surgery_history')
        .eq('id', userId)
        .maybeSingle();
      if (error) throw new Error(`PROFILE_FAILED ${error.message}`);
      if (!data) return { id: userId, userType: 'self_user', birthYear: null, medicalHistory: '', surgeryHistory: '' };
      return {
        id: data.id, userType: (data.user_type ?? 'self_user') as 'self_user' | 'supporter',
        birthYear: data.birth_year, medicalHistory: data.medical_history ?? '', surgeryHistory: data.surgery_history ?? '',
      };
    },
    async update(input) {
      const client = getSupabase();
      const { data: authData } = await client.auth.getUser();
      const userId = authData.user?.id;
      if (!userId) throw new Error('NOT_AUTHENTICATED');
      const { data, error } = await client
        .from('profiles')
        .upsert({ id: userId, birth_year: input.birthYear, medical_history: input.medicalHistory, surgery_history: input.surgeryHistory }, { onConflict: 'id' })
        .select('id,user_type,birth_year,medical_history,surgery_history')
        .single();
      if (error || !data) throw new Error(`PROFILE_UPDATE_FAILED ${error?.message ?? ''}`);
      return {
        id: data.id, userType: (data.user_type ?? 'self_user') as 'self_user' | 'supporter',
        birthYear: data.birth_year, medicalHistory: data.medical_history ?? '', surgeryHistory: data.surgery_history ?? '',
      };
    },
  },
  rephrase: {
    async rephrase(text) {
      const value = await requestJson<{ text: string }>('ai-rephrase', { method: 'POST', body: JSON.stringify({ clientRequestId: createClientId(), text, style: 'warm' }) });
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

export const services = process.env.NEXT_PUBLIC_USE_MOCKS === 'false' ? realServices : mockServices;
