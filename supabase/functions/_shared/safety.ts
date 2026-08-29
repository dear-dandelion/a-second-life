export interface SafetyResult {
  urgent: boolean;
  message?: string;
  kind?: "medical" | "self_harm";
}

const SELF_HARM = ["自杀", "不想活", "活不下去", "结束生命", "伤害自己", "自残"];
const MEDICAL_EMERGENCY = [
  "持续胸痛", "胸痛大汗", "喘不上气", "呼吸困难", "突然晕倒", "昏厥",
  "意识不清", "一侧无力", "说话含糊", "大出血", "出血不止",
];

export function checkSafety(text: string): SafetyResult {
  if (SELF_HARM.some((keyword) => text.includes(keyword))) {
    return {
      urgent: true,
      kind: "self_harm",
      message: "我很在意你现在的安全。请立即联系身边可信任的人，并拨打全国统一心理援助热线 12356；如果存在立即伤害自己的危险，请马上拨打 120/110 或前往最近急诊。",
    };
  }
  if (MEDICAL_EMERGENCY.some((keyword) => text.includes(keyword))) {
    return {
      urgent: true,
      kind: "medical",
      message: "这些情况可能需要紧急处理。请不要仅等待在线回复，立即联系当地急救服务或前往最近急诊，并尽量请身边的人陪同。",
    };
  }
  return { urgent: false };
}

export function detectNavigation(text: string): { target: string; params?: Record<string, string> } | null {
  if (/报告|导出给医生|就医报告/.test(text)) return { target: "reportExport" };
  if (/月度总结|这个月总结/.test(text)) return { target: "monthlySummary" };
  if (/月历|曲线|这个月的(睡眠|潮热|心情|运动)|月度记录/.test(text)) return { target: "monthlyRecords" };
  if (/今日行动|今天动一动|今天.*建议/.test(text)) return { target: "exerciseToday" };
  if (/全部.*(行动|建议)|六个分类/.test(text)) return { target: "exerciseCategories" };
  if (/填写.*记录|健康卡片|今日记录/.test(text)) return { target: "healthCard" };
  if (/个人资料|我的资料/.test(text)) return { target: "profile" };
  return null;
}

export function asksForMonthlyRecords(text: string): boolean {
  return /(看看|查询|回顾|总结).*(睡眠|潮热|心情|运动|记录)|这个月.*怎么样/.test(text);
}
