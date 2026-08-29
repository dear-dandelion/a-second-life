import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { embedTexts } from "./model.ts";
import type { KnowledgeMatch } from "./types.ts";

const DOMAIN_TERMS = [
  "更年期", "围绝经", "绝经", "潮热", "盗汗", "睡眠", "失眠", "月经", "出血",
  "情绪", "焦虑", "抑郁", "骨质疏松", "激素治疗", "运动", "饮食", "体重",
  "心悸", "头痛", "关节", "性生活", "阴道干涩", "家人", "伴侣",
];

export async function retrieveKnowledge(adminClient: SupabaseClient, query: string, limit = 5): Promise<KnowledgeMatch[]> {
  let vector: number[] | null = null;
  try {
    vector = (await embedTexts([query]))?.[0] ?? null;
  } catch (error) {
    console.warn("Embedding unavailable; using keyword retrieval", error instanceof Error ? error.message : String(error));
  }
  const queries = vector
    ? [query]
    : [query, ...DOMAIN_TERMS.filter((term) => query.includes(term)).slice(0, 3)];
  const results = await Promise.all(queries.map((queryText) => adminClient.rpc("match_knowledge_chunks", {
    query_text: queryText,
    query_embedding: vector ? `[${vector.join(",")}]` : null,
    match_count: limit,
  })));
  const successful = results.filter((result) => {
    if (result.error) console.warn("Knowledge retrieval failed", result.error.message);
    return !result.error;
  });
  const rowsByChunk = new Map<string, Record<string, unknown>>();
  for (const result of successful) {
    for (const row of (result.data ?? []) as Array<Record<string, unknown>>) {
      const id = String(row.chunk_id);
      const previous = rowsByChunk.get(id);
      if (!previous || Number(row.score ?? 0) > Number(previous.score ?? 0)) rowsByChunk.set(id, row);
    }
  }
  return [...rowsByChunk.values()]
    .map((row) => ({
      chunkId: String(row.chunk_id),
      documentId: String(row.document_id),
      title: String(row.title),
      publisher: row.source ? String(row.source) : undefined,
      sourceUrl: row.source_url ? String(row.source_url) : undefined,
      reviewedAt: row.collected_on ? String(row.collected_on) : undefined,
      topic: row.topic ? String(row.topic) : undefined,
      content: String(row.content),
      score: Number(row.score ?? 0),
    }))
    .filter((item) => item.score >= 0.03)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export function ragContext(matches: KnowledgeMatch[]): string {
  if (matches.length === 0) return "";
  return matches.map((match, index) =>
    `[资料${index + 1}] ${match.title}（${match.publisher ?? "来源未标注"}）\n${match.content.slice(0, 1400)}`
  ).join("\n\n");
}
