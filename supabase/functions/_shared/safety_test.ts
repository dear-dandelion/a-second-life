import { checkSafety, detectNavigation } from "./safety.ts";

function assertEquals(actual: unknown, expected: unknown) {
  if (actual !== expected) throw new Error(`Expected ${String(expected)}, received ${String(actual)}`);
}

function assertMatch(actual: string, expected: RegExp) {
  if (!expected.test(actual)) throw new Error(`Expected ${actual} to match ${expected}`);
}

Deno.test("自伤和急症触发不可覆盖的紧急提示", () => {
  const selfHarm = checkSafety("我真的不想活了");
  assertEquals(selfHarm.urgent, true);
  assertMatch(selfHarm.message ?? "", /12356/);
  assertEquals(checkSafety("我突然晕倒了").kind, "medical");
});

Deno.test("只返回 MVP 页面导航", () => {
  assertEquals(detectNavigation("帮我打开就医报告")?.target, "reportExport");
  assertEquals(detectNavigation("我想去商城"), null);
});

Deno.test("资料填写只生成待确认页面参数", () => {
  const intent = detectNavigation("填写个人资料：出生年份1978，既往病史高血压，手术史无");
  assertEquals(intent?.target, "profile");
  assertEquals(intent?.params?.birthYear, "1978");
  assertEquals(intent?.params?.medicalHistory, "高血压");
  assertEquals(intent?.params?.surgeryHistory, "无");
});
