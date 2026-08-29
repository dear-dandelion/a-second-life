export type ISODate = `${number}-${number}-${number}`;
export type Severity = '轻' | '中' | '重';

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

export type ChatSseEvent =
  | { type: 'message_started'; data: { conversationId: string; clientMessageId: string } }
  | { type: 'text_delta'; data: { delta: string } }
  | { type: 'tool_status'; data: { name: string; status: 'running' | 'done' } }
  | { type: 'health_card_preview'; data: { draftId: string; recordDate: ISODate; items?: HealthDraftItem[] } }
  | { type: 'message_completed'; data: { messageId: string; speakableText: string } }
  | { type: 'safety_alert'; data: { level: 'urgent'; message: string } }
  | { type: 'error'; data: { code: string; message: string; retryable: boolean } };

export interface FrontendServices {
  recommendations: { getToday(): Promise<Recommendation[]> };
  chat: { stream(text: string, clientMessageId: string, conversationId: string | null, signal: AbortSignal): AsyncIterable<ChatSseEvent> };
  healthCard: { confirm(draftId: string, selectedItems: HealthDraftItem[], idempotencyKey: string): Promise<{ savedItemCount: number }> };
  profile: { get(): Promise<Profile>; update(input: Omit<Profile, 'id' | 'userType'>): Promise<Profile> };
  rephrase: { rephrase(text: string): Promise<string> };
  summaries: { list(): Promise<MonthlySummary[]>; get(month: string): Promise<MonthlySummary> };
}
