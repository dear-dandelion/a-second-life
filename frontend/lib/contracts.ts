export type ISODate = `${number}-${number}-${number}`;
export type Severity = '轻' | '中' | '重';
export type HealthCategory =
  | 'symptom' | 'mood' | 'sleep' | 'menstrual' | 'weight' | 'appetite'
  | 'exercise' | 'diet' | 'medication' | 'lifeEvent' | 'medicalNeed' | 'other';

export type NavigationTarget =
  | 'reportExport' | 'monthlySummary' | 'monthlyRecords' | 'exerciseToday'
  | 'exerciseCategories' | 'healthCard' | 'profile';

export interface Recommendation {
  id: string;
  category: string;
  title: string;
  description: string;
}

export interface Profile {
  id: string;
  userType: 'self_user' | 'supporter';
  birthYear: number | null;
  medicalHistory: string;
  surgeryHistory: string;
}

export interface MonthlySummary {
  id: string;
  month: `${number}-${number}`;
  overview: string;
  goodThings: string[];
  dimensions: Array<{ key: string; title: string; content: string }>;
  generatedAt: string;
  hasNew: boolean;
}

export interface HealthDraftItem {
  clientItemId: string;
  category: string;
  operation: 'create' | 'update' | 'delete';
  targetRecordId?: string;
  data?: Record<string, unknown> | string;
  quote?: string;
  confidence?: number;
}

export interface HealthRecord {
  id?: string;
  date: ISODate;
  symptoms: Array<{
    id?: string; symptom: string; occurred: boolean; severity?: Severity;
    frequency?: string; frequencyCount?: number; trend?: '加重' | '减轻' | '稳定';
    trigger?: string; quote?: string;
  }>;
  mood?: { id?: string; type: '负面' | '正面'; description: string; trigger?: string };
  sleep?: { id?: string; quality?: '好' | '一般' | '差'; bedtime?: string; wakeTime?: string; nightWakes?: number; detail?: string };
  menstrual?: { id?: string; event: '来了' | '没来' | '量多' | '量少' | '淋漓不尽' | '非经期出血' | '痛经' | '停经'; date?: string; daysSinceLast?: number; note?: string };
  weight?: { id?: string; direction: '增加' | '减少'; amount?: string; speed?: '突然' | '缓慢'; date?: string };
  appetite?: '增加' | '减少' | '正常';
  exercise?: { id?: string; type: string; duration?: string; frequency?: string; intensity?: '轻松' | '适中' | '累' };
  diet?: { id?: string; mealsRegular?: boolean; foods?: string[]; water?: '充足' | '偏少'; caffeine?: string; alcohol?: string; smoking?: boolean };
  medications?: Array<{ id?: string; name: string; action: '服用' | '漏服' | '停用' }>;
  lifeEvents?: Array<{ id?: string; category: '家庭' | '社交' | '心情事件'; description: string; impact: '正面' | '负面' | '中性' }>;
  medicalNeeds?: string;
  other?: string;
}

export interface HealthRecordSummary { date: ISODate; updatedAt: string }
export interface MonthlyHealthStats {
  month: `${number}-${number}`;
  days: Array<{date:ISODate;hasRecord:boolean;sleep?:Record<string,unknown>|null;hotFlash?:Record<string,unknown>|null;mood?:Record<string,unknown>|null;exercise?:Record<string,unknown>|null}>;
  digest?: {text:string;highlights:string[]}|null;
}

export type ChatSseEvent =
  | { type: 'message_started'; data: { conversationId: string; clientMessageId: string } }
  | { type: 'text_delta'; data: { delta: string } }
  | { type: 'tool_status'; data: { name: string; status: 'running' | 'done' } }
  | { type: 'navigation'; data: { target: NavigationTarget; params?: Record<string, string> } }
  | { type: 'rag_sources'; data: { sources: Array<{ title: string; sourceUrl?: string; publisher?: string }> } }
  | { type: 'health_card_updated'; data: { recordDate: ISODate; items: HealthDraftItem[]; savedItemCount: number } }
  | { type: 'health_card_update_failed'; data: { recordDate: ISODate; message: string } }
  /** Compatibility with chat functions deployed before automatic health-card updates. */
  | { type: 'health_card_preview'; data: { draftId: string; recordDate: ISODate; items?: HealthDraftItem[] } }
  | { type: 'message_completed'; data: { messageId: string; speakableText: string } }
  | { type: 'safety_alert'; data: { level: 'urgent'; message: string } }
  | { type: 'error'; data: { code: string; message: string; retryable: boolean } };

export interface FrontendServices {
  recommendations: { getToday(): Promise<Recommendation[]> };
  chat: { stream(text: string, clientMessageId: string, conversationId: string | null, signal: AbortSignal): AsyncIterable<ChatSseEvent> };
  healthCard: { confirm(draftId: string, selectedItems: HealthDraftItem[], idempotencyKey: string): Promise<{ savedItemCount: number }> };
  healthRecords: {
    list(): Promise<HealthRecordSummary[]>;
    get(date: string): Promise<HealthRecord | null>;
    save(date: string, record: HealthRecord): Promise<{ recordId: string; recordDate: string }>;
    monthly(month: string): Promise<MonthlyHealthStats>;
  };
  speech: {
    transcribe(audio: Blob, durationMs: number, clientRequestId: string): Promise<string>;
    synthesize(messageId: string, text: string): Promise<Blob | null>;
  };
  profile: { get(): Promise<Profile>; update(input: Omit<Profile, 'id' | 'userType'>): Promise<Profile> };
  rephrase: { rephrase(text: string, options?: { audience?: '伴侣' | '家人' | '朋友' | '同事' | '不指定' }): Promise<string> };
  summaries: { list(): Promise<MonthlySummary[]>; get(month: string): Promise<MonthlySummary> };
}
