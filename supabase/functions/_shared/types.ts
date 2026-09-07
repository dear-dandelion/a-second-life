export type UserType = "self_user" | "supporter";
export type Severity = "轻" | "中" | "重";
export type Trend = "加重" | "减轻" | "稳定";
export type HealthCategory =
  | "symptom"
  | "mood"
  | "sleep"
  | "menstrual"
  | "weight"
  | "appetite"
  | "exercise"
  | "diet"
  | "medication"
  | "lifeEvent"
  | "medicalNeed"
  | "other";

export interface Profile {
  id: string;
  user_type: UserType;
  birth_year: number | null;
  height_cm: number | null;
  menopausal_status: string;
  medical_history: string;
  surgery_history: string;
  allergy_history: string;
  regular_medications: string;
  pregnancy_history: string;
  family_history: string;
  screening_history: string;
}

export interface SymptomRecord {
  id?: string;
  symptom: string;
  occurred: boolean;
  severity?: Severity;
  frequency?: string;
  frequencyCount?: number;
  trend?: Trend;
  trigger?: string;
  quote: string;
}

export interface HealthRecord {
  id?: string;
  version?: number;
  date: string;
  symptoms: SymptomRecord[];
  mood?: Record<string, unknown>;
  sleep?: Record<string, unknown>;
  menstrual?: Record<string, unknown>;
  weight?: Record<string, unknown>;
  appetite?: "增加" | "减少" | "正常";
  exercise?: Record<string, unknown>;
  diet?: Record<string, unknown>;
  medications?: Array<Record<string, unknown>>;
  lifeEvents?: Array<Record<string, unknown>>;
  medicalNeeds?: string;
  other?: string;
}

export interface HealthDraftItem {
  clientItemId: string;
  category: HealthCategory;
  operation: "create" | "update" | "delete";
  targetRecordId?: string;
  data?: Record<string, unknown> | string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  quote: string;
  confidence: number;
}

export interface HealthCardDraft {
  draftId: string;
  sourceMessageId: string;
  recordDate: string;
  items: HealthDraftItem[];
}

export interface RagSource {
  documentId: string;
  title: string;
  sourceUrl?: string;
  publisher?: string;
  reviewedAt?: string;
}

export interface KnowledgeMatch extends RagSource {
  chunkId: string;
  content: string;
  topic?: string;
  score: number;
}

export interface AuthContext {
  userId: string;
  accessToken: string;
  profile: Profile;
  userClient: import("npm:@supabase/supabase-js@2").SupabaseClient;
  adminClient: import("npm:@supabase/supabase-js@2").SupabaseClient;
}
