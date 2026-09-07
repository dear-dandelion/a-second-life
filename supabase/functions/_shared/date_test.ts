import { isIsoMonth, reportStartDate, resolveRecordDate, resolveRecordMonth, splitHealthTextByDate } from "./date.ts";

function assertEquals(actual: unknown, expected: unknown) {
  if (actual !== expected) throw new Error(`Expected ${String(expected)}, received ${String(actual)}`);
}

Deno.test("报告范围按自然月计算", () => {
  assertEquals(reportStartDate("1_month", "2026-09-07"), "2026-08-01");
  assertEquals(reportStartDate("3_months", "2026-09-07"), "2026-06-01");
  assertEquals(reportStartDate("6_months", "2026-09-07"), "2026-03-01");
  assertEquals(reportStartDate("1_month", "2026-01-01"), "2025-12-01");
  assertEquals(reportStartDate("1_month", "2024-03-31"), "2024-02-01");
});

Deno.test("月份校验拒绝溢出月份", () => {
  assertEquals(isIsoMonth("2026-08"), true);
  assertEquals(isIsoMonth("2026-13"), false);
});

Deno.test("对话中的历史日期可安全解析", () => {
  const now = new Date("2026-09-04T04:00:00Z");
  assertEquals(resolveRecordDate("修改昨天的睡眠记录", now), "2026-09-03");
  assertEquals(resolveRecordDate("补充8月29日的潮热记录", now), "2026-08-29");
  assertEquals(resolveRecordDate("修改2026-02-30的记录", now), "2026-09-04");
  assertEquals(resolveRecordDate("记录2027-01-01的情况", now), "2026-09-04");
});

Deno.test("对话中的月份可解析", () => {
  const now = new Date("2026-09-04T04:00:00Z");
  assertEquals(resolveRecordMonth("看看上个月的睡眠", now), "2026-08");
  assertEquals(resolveRecordMonth("看看2026年7月的睡眠", now), "2026-07");
});

Deno.test("一条对话按日期分别归入每日健康卡片", () => {
  const now = new Date("2026-09-04T04:00:00Z");
  assertEquals(JSON.stringify(splitHealthTextByDate("昨天睡得不好，今天食欲减少", now)), JSON.stringify([
    { recordDate: "2026-09-03", text: "昨天睡得不好，" },
    { recordDate: "2026-09-04", text: "今天食欲减少" },
  ]));
});
