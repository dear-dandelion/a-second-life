export type ISODate = `${number}-${number}-${number}`;
export type Severity = '轻' | '中' | '重';
export type MoodState = '舒展' | '平静' | '低落' | '焦虑' | '烦躁' | '复杂';
export type MoodIntensity = '轻微' | '明显' | '强烈';
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
  heightCm: number | null;
  menopausalStatus: '' | '未绝经' | '围绝经期' | '绝经后' | '不确定';
  medicalHistory: string;
  surgeryHistory: string;
  allergyHistory: string;
  regularMedications: string;
  pregnancyHistory: string;
  familyHistory: string;
  screeningHistory: string;
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
  /** Incremented by the database after every accepted partial update. */
  version?: number;
  date: ISODate;
  symptoms: Array<{
    id?: string; symptom: string; occurred: boolean; severity?: Severity;
    frequency?: string; frequencyCount?: number; trend?: '加重' | '减轻' | '稳定';
    trigger?: string; quote?: string;
  }>;
  mood?: { id?: string; state: MoodState; intensity?: MoodIntensity; description?: string; trigger?: string; source?: 'manual' | 'ai'; confidence?: number; quote?: string };
  sleep?: { id?: string; quality?: '好' | '一般' | '差'; bedtime?: string; wakeTime?: string; nightWakes?: number; detail?: string };
  menstrual?: { id?: string; event: '来了' | '没来' | '量多' | '量少' | '淋漓不尽' | '非经期出血' | '痛经' | '停经'; daysSinceLast?: number; note?: string };
  weight?: { id?: string; direction: '增加' | '减少'; amount?: string; speed?: '突然' | '缓慢' };
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

export type ReportRange = '1_month' | '3_months' | '6_months';
export interface ReportPreview {
  aggregationVersion?: string;
  generatedAt?: string;
  fields?: Record<string, { text: string; details?:string; notice?:string; state: 'recorded' | 'missing'; sources: Array<{recordId:string;recordDate:string;version:number}> }>;
  reportId: string | null;
  range: { startDate: string; endDate: string };
  profile: {
    birthYear: number | null; height: number | null; menopausalStatus: string | null;
    usesMedication: boolean | null; chiefComplaint: string; medicalHistory: string;
    regularMedications?: string;
    surgeryHistory: string; medications: Array<{ name: string; status: string }>;
    allergies: string[]; pregnancyHistory: string | null; familyHistory: string | null;
    screenings: string | null;
  };
  summary: { menstrual: string; symptoms: Array<{ symptom: string; days: number; frequencySummary: string; severityMode: string | null; trend: string | null; quotes: string[] }>; weight: string; exercise: string };
  dataWarnings: string[];
}
export interface ReportDraft {
  id: string; range: ReportRange; snapshot: ReportPreview; overrides: Record<string, string>; status: 'draft' | 'exported'; updatedAt: string;
}
export interface ReportCoverage {
  range: ReportRange;
  startDate: string;
  endDate: string;
  totalDays: number;
  recordedDays: number;
  coveragePercent: number;
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
    save(date: string, record: HealthRecord, expectedVersion: number, categories: HealthCategory[]): Promise<{ recordId: string; recordDate: string; version: number }>;
    monthly(month: string): Promise<MonthlyHealthStats>;
  };
  speech: {
    transcribe(audio: Blob, durationMs: number, clientRequestId: string): Promise<string>;
    synthesize(messageId: string, text: string): Promise<Blob | null>;
  };
  profile: { get(): Promise<Profile>; update(input: Omit<Profile, 'id' | 'userType'>): Promise<Profile> };
  rephrase: { rephrase(text: string, options?: { audience?: '伴侣' | '家人' | '朋友' | '同事' | '不指定' }): Promise<string> };
  summaries: { list(): Promise<MonthlySummary[]>; get(month: string): Promise<MonthlySummary> };
  reports: {
    preview(range: ReportRange, chiefComplaint?: string): Promise<ReportPreview>;
    coverage(range: ReportRange): Promise<ReportCoverage>;
    saveDraft(input: { id?: string; range: ReportRange; snapshot: ReportPreview; overrides: Record<string, string> }): Promise<ReportDraft>;
  };
}
