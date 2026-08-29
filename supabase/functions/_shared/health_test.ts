import { applyDraftItems } from "./health.ts";
import type { HealthDraftItem, HealthRecord } from "./types.ts";

function assertEquals(actual: unknown, expected: unknown) {
  if (actual !== expected) throw new Error(`Expected ${String(expected)}, received ${String(actual)}`);
}

function otherItem(data: string | Record<string, unknown> | undefined, operation: "create" | "update" | "delete" = "create"): HealthDraftItem {
  return {
    clientItemId: crypto.randomUUID(),
    category: "other",
    operation,
    data,
    quote: typeof data === "string" ? data : "",
    confidence: 0.8,
  };
}

function base(other?: string): HealthRecord {
  return { date: "2026-08-29", symptoms: [], medications: [], lifeEvents: [], ...(other !== undefined ? { other } : {}) };
}

Deno.test("other 首次创建直接写入", () => {
  const record = applyDraftItems(null, "2026-08-29", [otherItem("今天去公园喂鸽子")]);
  assertEquals(record.other, "今天去公园喂鸽子");
});

Deno.test("other 二次创建以「；」追加", () => {
  const record = applyDraftItems(base("昨天和老姐妹爬山"), "2026-08-29", [otherItem("今天去公园喂鸽子")]);
  assertEquals(record.other, "昨天和老姐妹爬山；今天去公园喂鸽子");
});

Deno.test("other 重复内容不追加", () => {
  const record = applyDraftItems(base("今天去公园喂鸽子"), "2026-08-29", [otherItem("今天去公园喂鸽子")]);
  assertEquals(record.other, "今天去公园喂鸽子");
});

Deno.test("other 支持对象 data 的 value 字段", () => {
  const record = applyDraftItems(null, "2026-08-29", [otherItem({ value: "买了新血压计" })]);
  assertEquals(record.other, "买了新血压计");
});

Deno.test("other delete 清空整个字段", () => {
  const record = applyDraftItems(base("昨天和老姐妹爬山"), "2026-08-29", [otherItem(undefined, "delete")]);
  assertEquals(record.other, undefined);
});

Deno.test("other 空内容不写入", () => {
  const record = applyDraftItems(null, "2026-08-29", [otherItem("  ")]);
  assertEquals(record.other, undefined);
});

function sleepItem(data: Record<string, unknown>): HealthDraftItem {
  return { clientItemId: crypto.randomUUID(), category: "sleep", operation: "create", data, quote: "", confidence: 0.8 };
}

function symptomItem(data: Record<string, unknown>): HealthDraftItem {
  return { clientItemId: crypto.randomUUID(), category: "symptom", operation: "create", data, quote: "", confidence: 0.8 };
}

Deno.test("sleep quality 别名映射为枚举值", () => {
  const record = applyDraftItems(null, "2026-08-29", [sleepItem({ quality: "还行", nightWakes: 1 })]);
  assertEquals((record.sleep as Record<string, unknown>)?.quality, "一般");
});

Deno.test("sleep quality 非法值被移除", () => {
  const record = applyDraftItems(null, "2026-08-29", [sleepItem({ quality: "舒服" })]);
  assertEquals((record.sleep as Record<string, unknown>)?.quality, undefined);
});

Deno.test("非法 bedtime 格式被移除", () => {
  const record = applyDraftItems(null, "2026-08-29", [sleepItem({ bedtime: "晚上十一点" })]);
  assertEquals((record.sleep as Record<string, unknown>)?.bedtime, undefined);
});

Deno.test("症状非法 severity/trend 被移除", () => {
  const record = applyDraftItems(null, "2026-08-29", [symptomItem({ symptom: "潮热", occurred: true, severity: "很重", trend: "变差" })]);
  const symptom = record.symptoms[0] as unknown as Record<string, unknown>;
  assertEquals(symptom.severity, undefined);
  assertEquals(symptom.trend, undefined);
});

Deno.test("药品非法 action 按服用兜底", () => {
  const record = applyDraftItems(null, "2026-08-29", [{
    clientItemId: crypto.randomUUID(), category: "medication", operation: "create",
    data: { name: "钙片", action: "偶尔吃" }, quote: "", confidence: 0.8,
  }]);
  assertEquals((record.medications?.[0] as Record<string, unknown>)?.action, "服用");
});
