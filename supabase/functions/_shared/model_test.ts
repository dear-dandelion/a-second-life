import { draftDataShapeErrors } from "./model.ts";

function assertEquals(actual: unknown, expected: unknown) {
  if (actual !== expected) throw new Error(`Expected ${String(expected)}, received ${String(actual)}`);
}

function item(category: string, data?: unknown): Record<string, unknown> {
  return { clientItemId: "x", category, operation: "create", ...(data === undefined ? {} : { data }) };
}

Deno.test("对象类别 data 为对象时无错误", () => {
  assertEquals(draftDataShapeErrors([item("symptom", { symptom: "潮热", occurred: true })]).length, 0);
  assertEquals(draftDataShapeErrors([item("sleep", { quality: "差" })]).length, 0);
  assertEquals(draftDataShapeErrors([item("lifeEvent", { description: "x" })]).length, 0);
});

Deno.test("对象类别 data 为字符串时报错", () => {
  const errors = draftDataShapeErrors([item("symptom", "潮热了三次")]);
  assertEquals(errors.length, 1);
  assertEquals(errors[0].includes("对象"), true);
});

Deno.test("对象类别 data 为数组时报错", () => {
  assertEquals(draftDataShapeErrors([item("exercise", [])]).length, 1);
});

Deno.test("字符串类别 data 为字符串时无错误", () => {
  assertEquals(draftDataShapeErrors([item("other", "去公园喂鸽子")]).length, 0);
  assertEquals(draftDataShapeErrors([item("appetite", "减少")]).length, 0);
  assertEquals(draftDataShapeErrors([item("medicalNeed", "想解决失眠")]).length, 0);
});

Deno.test("字符串类别 data 为对象时报错", () => {
  assertEquals(draftDataShapeErrors([item("other", { value: "x" })]).length, 1);
});

Deno.test("delete 缺 data 不报错，非法类别忽略", () => {
  assertEquals(draftDataShapeErrors([{ clientItemId: "x", category: "symptom", operation: "delete" }]).length, 0);
  assertEquals(draftDataShapeErrors([item("notACategory", "x")]).length, 0);
});
