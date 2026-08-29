import type { HealthDraftItem, HealthRecord, KnowledgeMatch } from "./types.ts";

const symptomMap: Array<[string, string[]]> = [
  ["潮热", ["潮热", "烘热", "脸发烫", "忽冷忽热"]],
  ["盗汗", ["盗汗", "夜里出汗", "半夜一身汗"]],
  ["心悸", ["心悸", "心慌", "心跳快"]],
  ["胸闷", ["胸闷", "憋得慌", "喘不上气"]],
  ["疲劳", ["疲劳", "乏力", "没精神", "浑身没劲"]],
  ["头痛", ["头痛", "头疼", "偏头痛"]],
  ["头晕", ["头晕", "发晕", "眼前发黑"]],
  ["关节痛", ["关节痛", "膝盖疼", "关节僵硬"]],
  ["夜尿", ["夜尿", "起夜"]],
  ["失眠", ["失眠", "睡不着"]],
];

function quoteAround(text: string, keyword: string): string {
  const index = text.indexOf(keyword);
  if (index < 0) return text.slice(0, 80);
  return text.slice(Math.max(0, index - 15), Math.min(text.length, index + keyword.length + 30));
}

function frequencyCount(text: string, keyword: string): number | undefined {
  const around = quoteAround(text, keyword);
  const match = around.match(/(?:一天|今天)?\s*([一二两三四五六七八九十\d]+)\s*次/);
  if (!match) return undefined;
  const chinese: Record<string, number> = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
  return Number(match[1]) || chinese[match[1]];
}

function severity(text: string): "轻" | "中" | "重" | undefined {
  if (/很难受|严重|重度|厉害|受不了/.test(text)) return "重";
  if (/有点|轻微|不太/.test(text)) return "轻";
  if (/难受|明显/.test(text)) return "中";
  return undefined;
}

export function mockExtractHealth(text: string, currentRecord: HealthRecord | null = null): HealthDraftItem[] {
  const items: HealthDraftItem[] = [];
  for (const [canonical, keywords] of symptomMap) {
    const keyword = keywords.find((value) => text.includes(value));
    if (!keyword || canonical === "失眠") continue;
    const negated = new RegExp(`(没有|没|不再|最近没有).{0,5}${keyword}`).test(text);
    const count = frequencyCount(text, keyword);
    items.push({
      clientItemId: crypto.randomUUID(),
      category: "symptom",
      operation: "create",
      data: {
        symptom: canonical,
        occurred: !negated,
        ...(severity(text) ? { severity: severity(text) } : {}),
        ...(count !== undefined ? { frequency: `${count}次`, frequencyCount: count } : {}),
        ...(/越来越|加重/.test(text) ? { trend: "加重" } : /好多了|减轻/.test(text) ? { trend: "减轻" } : {}),
        quote: quoteAround(text, keyword),
      },
      quote: quoteAround(text, keyword),
      confidence: 0.82,
    });
  }

  if (/睡不着|入睡难|早醒|多梦|睡不好|两点才睡|熬夜/.test(text)) {
    const bedtime = text.match(/([01]?\d|2[0-3])(?:点|[:：](\d{2}))/);
    items.push({
      clientItemId: crypto.randomUUID(), category: "sleep", operation: "create",
      data: {
        quality: /睡不好|睡不着|入睡难|早醒/.test(text) ? "差" : undefined,
        bedtime: bedtime ? `${bedtime[1].padStart(2, "0")}:${bedtime[2] ?? "00"}` : undefined,
        detail: quoteAround(text, bedtime?.[0] ?? "睡"),
      },
      quote: quoteAround(text, bedtime?.[0] ?? "睡"), confidence: 0.78,
    });
  }
  const moodKeyword = ["烦躁", "焦虑", "低落", "想哭", "孤独", "开心", "平静", "轻松"].find((value) => text.includes(value));
  if (moodKeyword) {
    items.push({
      clientItemId: crypto.randomUUID(), category: "mood", operation: "create",
      data: { type: ["开心", "平静", "轻松"].includes(moodKeyword) ? "正面" : "负面", description: moodKeyword },
      quote: quoteAround(text, moodKeyword), confidence: 0.85,
    });
  }
  const exercise = ["散步", "快走", "广场舞", "瑜伽", "太极", "游泳", "骑车", "跑步"].find((value) => text.includes(value));
  if (exercise) {
    const duration = text.match(/(\d+|半)\s*(分钟|小时)/)?.[0];
    items.push({
      clientItemId: crypto.randomUUID(), category: "exercise", operation: "create",
      data: { type: exercise, ...(duration ? { duration } : {}) },
      quote: quoteAround(text, exercise), confidence: 0.88,
    });
  }
  const medication = text.match(/(吃了|服了|忘了吃|漏服|停了)([^，。,.]{1,12}(?:药|片|胶囊|维生素|钙片))/);
  if (medication) {
    const action = /忘|漏/.test(medication[1]) ? "漏服" : /停/.test(medication[1]) ? "停用" : "服用";
    items.push({
      clientItemId: crypto.randomUUID(), category: "medication", operation: "create",
      data: { name: medication[2], action }, quote: medication[0], confidence: 0.75,
    });
  }
  if (/想找医生|想去医院|想解决/.test(text)) {
    items.push({
      clientItemId: crypto.randomUUID(), category: "medicalNeed", operation: "create",
      data: text.slice(0, 200), quote: text.slice(0, 100), confidence: 0.75,
    });
  }
  const wantsDelete = /删除|删掉|不要记录|记错了/.test(text);
  const wantsUpdate = wantsDelete || /改成|改为|修改|更正/.test(text);
  if (wantsUpdate && currentRecord) {
    for (const item of items) {
      const candidates = item.category === "symptom"
        ? currentRecord.symptoms.filter((existing) => existing.symptom === (item.data as Record<string, unknown>)?.symptom)
        : item.category === "medication" ? currentRecord.medications ?? []
        : item.category === "lifeEvent" ? currentRecord.lifeEvents ?? []
        : [currentRecord[item.category as keyof HealthRecord]].filter(Boolean) as Array<Record<string, unknown>>;
      const target = candidates.find((value) => typeof value?.id === "string");
      if (target?.id) {
        item.operation = wantsDelete ? "delete" : "update";
        item.targetRecordId = String(target.id);
        if (wantsDelete) item.data = undefined;
      }
    }
  }
  const isQuestion = /[?？]|怎么办|为什么|怎么|能不能|可以吗/.test(text);
  if (items.length === 0 && !wantsUpdate && !isQuestion) {
    const content = text.trim().slice(0, 200);
    if (content.length >= 2) {
      items.push({
        clientItemId: crypto.randomUUID(), category: "other", operation: "create",
        data: content, quote: text.trim().slice(0, 100), confidence: 0.6,
      });
    }
  }
  return items;
}

export function mockChatReply(userText: string, knowledge: KnowledgeMatch[], recordContext?: unknown): string {
  let response = /睡|潮热|难受|焦虑|烦躁/.test(userText)
    ? "听起来这段时间确实不太舒服。你愿意把这些感受说出来已经很重要，我会帮你把事实整理清楚。"
    : "我在听。你可以慢慢说，我会尽量用清楚、温和的方式陪你一起梳理。";
  if (recordContext) response += " 我也参考了你已经确认的近期记录。";
  if (knowledge.length > 0) response += ` 根据${knowledge[0].publisher ?? knowledge[0].title}的资料，症状明显或持续影响生活时，建议及时咨询妇科或更年期专科医生。`;
  response += " 这里的信息不能替代医生诊断或治疗建议。";
  return response;
}

export function chunkText(text: string, size = 12): string[] {
  const chunks: string[] = [];
  for (let index = 0; index < text.length; index += size) chunks.push(text.slice(index, index + size));
  return chunks;
}
