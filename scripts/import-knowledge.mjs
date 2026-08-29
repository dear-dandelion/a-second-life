import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chunkMarkdown, parseMarkdown, sha256, shouldInclude } from "./lib/knowledge.mjs";

async function loadEnv(filename) {
  try {
    const content = await readFile(filename, "utf8");
    for (const line of content.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!match || match[2].startsWith("#") || process.env[match[1]]) continue;
      let value = match[2];
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
      process.env[match[1]] = value;
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

async function markdownFiles(root) {
  const found = [];
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(fullPath);
      else {
        const relative = path.relative(root, fullPath);
        if (shouldInclude(relative)) found.push({ fullPath, relative: relative.replaceAll("\\", "/") });
      }
    }
  }
  await walk(root);
  return found.sort((a, b) => a.relative.localeCompare(b.relative, "zh-CN"));
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`缺少环境变量 ${name}`);
  return value.replace(/\/$/, "");
}

async function rest(method, resource, body) {
  const url = requireEnv("SUPABASE_URL");
  const key = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const response = await fetch(`${url}/rest/v1/${resource}`, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "return=representation,resolution=merge-duplicates",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok) throw new Error(`${method} ${resource} 失败 (${response.status}): ${await response.text()}`);
  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

function modelEndpoint(pathname) {
  return `${requireEnv("MODEL_BASE_URL")}/${pathname}`;
}

async function embeddings(texts) {
  if (!process.env.MODEL_BASE_URL || !process.env.MODEL_API_KEY) return null;
  const response = await fetch(modelEndpoint("embeddings"), {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.MODEL_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.EMBEDDING_MODEL || "text-embedding-v4",
      input: texts,
      ...(process.env.EMBEDDING_DIMENSIONS ? { dimensions: Number(process.env.EMBEDDING_DIMENSIONS) } : {}),
    }),
  });
  if (!response.ok) throw new Error(`Embedding 生成失败 (${response.status}): ${await response.text()}`);
  const result = await response.json();
  return result.data.sort((a, b) => a.index - b.index).map((item) => item.embedding);
}

async function prepare(root) {
  const files = await markdownFiles(root);
  return Promise.all(files.map(async ({ fullPath, relative }) => {
    const raw = await readFile(fullPath, "utf8");
    const parsed = parseMarkdown(raw);
    return {
      relative,
      document: {
        source_path: relative,
        title: parsed.title,
        source: parsed.metadata.source || "本地知识库",
        source_url: parsed.metadata.url || null,
        topic: parsed.metadata.topic || null,
        collected_on: parsed.metadata.collected || null,
        content_hash: sha256(parsed.body),
      },
      chunks: chunkMarkdown(parsed.body),
    };
  }));
}

export async function main(args = process.argv.slice(2)) {
  await loadEnv(path.resolve(".env.local"));
  await loadEnv(path.resolve(".env"));
  const dryRun = args.includes("--dry-run");
  const publish = args.includes("--publish");
  const root = path.resolve(process.env.KNOWLEDGE_BASE_PATH || "G:/tide/menopause-knowledge-base");
  const documents = await prepare(root);
  const totalChunks = documents.reduce((sum, item) => sum + item.chunks.length, 0);
  console.log(`知识库目录：${root}`);
  console.log(`文档 ${documents.length} 篇，分块 ${totalChunks} 个，状态 ${publish ? "published" : "draft"}`);
  if (dryRun) {
    for (const item of documents) console.log(`- ${item.relative}: ${item.chunks.length} chunks`);
    return;
  }

  for (const [index, item] of documents.entries()) {
    const rows = await rest("POST", "knowledge_documents?on_conflict=source_path", [{
      ...item.document,
      status: "draft",
    }]);
    const documentId = rows?.[0]?.id;
    if (!documentId) throw new Error(`文档 ${item.relative} upsert 后没有返回 id`);
    await rest("DELETE", `knowledge_chunks?document_id=eq.${encodeURIComponent(documentId)}`);

    for (let offset = 0; offset < item.chunks.length; offset += 10) {
      const batch = item.chunks.slice(offset, offset + 10);
      const vectors = await embeddings(batch.map((chunk) => chunk.content));
      const payload = batch.map((chunk, batchIndex) => ({
        document_id: documentId,
        chunk_index: offset + batchIndex,
        heading: chunk.heading,
        content: chunk.content,
        content_hash: chunk.contentHash,
        embedding: vectors ? `[${vectors[batchIndex].join(",")}]` : null,
        embedding_model: vectors ? (process.env.EMBEDDING_MODEL || "text-embedding-v4") : null,
        metadata: { sourcePath: item.relative, topic: item.document.topic },
      }));
      await rest("POST", "knowledge_chunks", payload);
    }
    if (publish) {
      await rest("PATCH", `knowledge_documents?id=eq.${encodeURIComponent(documentId)}`, { status: "published" });
    }
    console.log(`[${index + 1}/${documents.length}] ${item.relative}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
