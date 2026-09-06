import type { HealthDraftItem, HealthRecord } from "./types.ts";

function cloneRecord(record: HealthRecord | null, date: string): HealthRecord {
  return record ? structuredClone(record) : { date, symptoms: [], medications: [], lifeEvents: [] };
}

function normalizedData(item: HealthDraftItem): Record<string, unknown> | string | undefined {
  return item.after ?? item.data;
}

function updateById<T extends { id?: string }>(items: T[], targetId: string, patch: Record<string, unknown>): T[] {
  return items.map((value) => value.id === targetId ? { ...value, ...patch } as T : value);
}

export function enrichDraftItems(record: HealthRecord | null, items: HealthDraftItem[]): HealthDraftItem[] {
  if (!record) return items;
  const candidates: Array<Record<string, unknown>> = [
    ...(record.symptoms as unknown as Array<Record<string, unknown>>),
    ...(record.medications ?? []),
    ...(record.lifeEvents ?? []),
    ...([record.mood, record.sleep, record.menstrual, record.weight, record.exercise, record.diet]
      .filter((value): value is Record<string, unknown> => Boolean(value))),
  ];
  return items.map((item) => {
    if (item.operation === "create" || !item.targetRecordId) return item;
    const before = candidates.find((candidate) => candidate.id === item.targetRecordId);
    if (!before) return item;
    return {
      ...item,
      before: structuredClone(before),
      ...(item.operation === "update" && item.data && typeof item.data === "object" ? { after: item.data } : {}),
    };
  });
}

export function applyDraftItems(
  existing: HealthRecord | null,
  recordDate: string,
  selected: HealthDraftItem[],
): HealthRecord {
  const record = cloneRecord(existing, recordDate);
  const mutableRecord = record as unknown as Record<string, unknown>;
  for (const item of selected) {
    const data = normalizedData(item);
    if (item.category === "symptom") {
      if (item.operation === "create") {
        if (data && typeof data === "object") record.symptoms.push(data as never);
        else if (data !== undefined && data !== null) console.warn("跳过非对象 symptom data", item.clientItemId);
      }
      if (item.operation === "update" && item.targetRecordId) {
        if (data && typeof data === "object") record.symptoms = updateById(record.symptoms, item.targetRecordId, data);
        else if (data !== undefined && data !== null) console.warn("跳过非对象 symptom 更新", item.clientItemId);
      }
      if (item.operation === "delete" && item.targetRecordId) {
        record.symptoms = record.symptoms.filter((value) => value.id !== item.targetRecordId);
      }
      continue;
    }
    const singularMap: Record<string, keyof HealthRecord> = {
      mood: "mood", sleep: "sleep", menstrual: "menstrual", weight: "weight",
      appetite: "appetite", exercise: "exercise", diet: "diet", medicalNeed: "medicalNeeds",
      other: "other",
    };
    if (item.category in singularMap) {
      const key = singularMap[item.category];
      if (item.operation === "delete") delete mutableRecord[key];
      else if (item.category === "medicalNeed" || item.category === "appetite") {
        mutableRecord[key] = typeof data === "string" ? data : data?.value;
      } else if (item.category === "other") {
        // other 是单文本累积字段：新增内容去重后以「；」追加，不做覆盖。
        const text = typeof data === "string"
          ? data.trim()
          : data && typeof data === "object" && typeof data.value === "string" ? data.value.trim() : "";
        if (text) {
          const current = typeof mutableRecord[key] === "string" ? mutableRecord[key] as string : "";
          if (!current.includes(text)) mutableRecord[key] = current ? `${current}；${text}` : text;
        }
      } else if (data && typeof data === "object") {
        const current = record[key];
        const nextData = item.category === "mood"
          ? { ...data, source: "ai", confidence: item.confidence, quote: item.quote }
          : data;
        mutableRecord[key] = item.operation === "update" && current && typeof current === "object"
          ? { ...current, ...nextData }
          : nextData;
      } else if (data !== undefined && data !== null) {
        console.warn("跳过非对象数据", item.clientItemId, item.category);
      }
      continue;
    }
    if (item.category === "medication") {
      record.medications ??= [];
      if (item.operation === "create" && data && typeof data === "object") record.medications.push(data);
      if (item.operation === "update" && item.targetRecordId && data && typeof data === "object") {
        record.medications = updateById(record.medications, item.targetRecordId, data);
      }
      if (item.operation === "delete" && item.targetRecordId) record.medications = record.medications.filter((value) => value.id !== item.targetRecordId);
    }
    if (item.category === "lifeEvent") {
      record.lifeEvents ??= [];
      if (item.operation === "create" && data && typeof data === "object") record.lifeEvents.push(data);
      if (item.operation === "update" && item.targetRecordId && data && typeof data === "object") {
        record.lifeEvents = updateById(record.lifeEvents, item.targetRecordId, data);
      }
      if (item.operation === "delete" && item.targetRecordId) record.lifeEvents = record.lifeEvents.filter((value) => value.id !== item.targetRecordId);
    }
  }
  return sanitizeRecord(record);
}

const SLEEP_QUALITY_ALIASES: Record<string, string> = {
  "还行": "一般", "还可以": "一般", "一般般": "一般",
  "不错": "好", "挺好": "好", "很好": "好", "非常好": "好",
  "很差": "差", "差劲": "差",
};

// 数据库枚举与格式兜底：模型输出的非法枚举值会映射或移除，避免确认时整单失败。
function sanitizeRecord(record: HealthRecord): HealthRecord {
  for (const symptom of record.symptoms) {
    const value = symptom as unknown as Record<string, unknown>;
    if (value.severity !== undefined && !["轻", "中", "重"].includes(String(value.severity))) delete value.severity;
    if (value.trend !== undefined && !["加重", "减轻", "稳定"].includes(String(value.trend))) delete value.trend;
    if (value.occurred !== undefined && typeof value.occurred !== "boolean") delete value.occurred;
    if (value.frequencyCount !== undefined && !Number.isInteger(value.frequencyCount)) delete value.frequencyCount;
  }
  const sleep = record.sleep as unknown as Record<string, unknown> | undefined;
  if (sleep) {
    if (sleep.quality !== undefined) {
      const quality = String(sleep.quality);
      sleep.quality = SLEEP_QUALITY_ALIASES[quality] ?? (["好", "一般", "差"].includes(quality) ? quality : undefined);
      if (sleep.quality === undefined) delete sleep.quality;
    }
    if (sleep.bedtime !== undefined && !/^\d{2}:\d{2}$/.test(String(sleep.bedtime))) delete sleep.bedtime;
    if (sleep.wakeTime !== undefined && !/^\d{2}:\d{2}$/.test(String(sleep.wakeTime))) delete sleep.wakeTime;
    if (sleep.nightWakes !== undefined && !Number.isInteger(sleep.nightWakes)) delete sleep.nightWakes;
  }
  const mood = record.mood as unknown as Record<string, unknown> | undefined;
  if (mood) {
    if (!['舒展', '平静', '低落', '焦虑', '烦躁', '复杂'].includes(String(mood.state))) delete mood.state;
    if (mood.intensity !== undefined && !['轻微', '明显', '强烈'].includes(String(mood.intensity))) delete mood.intensity;
    if (mood.source !== undefined && !['manual', 'ai'].includes(String(mood.source))) delete mood.source;
    if (mood.confidence !== undefined && (typeof mood.confidence !== 'number' || mood.confidence < 0 || mood.confidence > 1)) delete mood.confidence;
  }
  const menstrual = record.menstrual as unknown as Record<string, unknown> | undefined;
  if (menstrual) {
    const events = ["来了", "没来", "量多", "量少", "淋漓不尽", "非经期出血", "痛经", "停经"];
    if (menstrual.event !== undefined && !events.includes(String(menstrual.event))) delete menstrual.event;
    if (menstrual.date !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(String(menstrual.date))) delete menstrual.date;
    if (menstrual.daysSinceLast !== undefined && !Number.isInteger(menstrual.daysSinceLast)) delete menstrual.daysSinceLast;
  }
  const diet = record.diet as unknown as Record<string, unknown> | undefined;
  if (diet) {
    if (diet.mealsRegular !== undefined && typeof diet.mealsRegular !== "boolean") delete diet.mealsRegular;
    if (diet.smoking !== undefined && typeof diet.smoking !== "boolean") delete diet.smoking;
  }
  for (const medication of record.medications ?? []) {
    const value = medication as Record<string, unknown>;
    if (value.action !== undefined && !["服用", "漏服", "停用"].includes(String(value.action))) {
      console.warn("药品 action 非法值已按服用处理", value.action);
      value.action = "服用";
    }
  }
  return record;
}

export async function sha256(input: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(input));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((value) => value.toString(16).padStart(2, "0")).join("");
}
