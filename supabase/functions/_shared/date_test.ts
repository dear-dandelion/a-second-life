import { isIsoMonth, reportStartDate } from "./date.ts";

function assertEquals(actual: unknown, expected: unknown) {
  if (actual !== expected) throw new Error(`Expected ${String(expected)}, received ${String(actual)}`);
}

Deno.test("报告范围按自然月计算", () => {
  assertEquals(reportStartDate("1_month", "2026-08-29"), "2026-08-01");
  assertEquals(reportStartDate("3_months", "2026-08-29"), "2026-06-01");
  assertEquals(reportStartDate("6_months", "2026-08-29"), "2026-03-01");
});

Deno.test("月份校验拒绝溢出月份", () => {
  assertEquals(isIsoMonth("2026-08"), true);
  assertEquals(isIsoMonth("2026-13"), false);
});
