import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { isPromptInjectionAttempt, isUserPerspectiveRewrite, readRewrite, rephrasePrompt } from "../supabase/functions/_shared/rephrase.mjs";

function parseEnv(text) {
  const values = {};
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!match || match[1].startsWith("#")) continue;
    values[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
  return values;
}

const source = process.argv[2]?.trim() || "我好累";
const audience = process.argv[3]?.trim() || "家人";
const localEnv = parseEnv(await readFile(resolve(".env"), "utf8"));
const baseUrl = (process.env.MODEL_BASE_URL || localEnv.MODEL_BASE_URL || "").replace(/\/$/, "");
const apiKey = process.env.MODEL_API_KEY || localEnv.MODEL_API_KEY || "";
const model = process.env.MODEL_CHAT_MODEL || localEnv.MODEL_CHAT_MODEL || "qwen-plus";

if (!baseUrl || !apiKey) throw new Error("缺少 MODEL_BASE_URL 或 MODEL_API_KEY；请在根目录 .env 或环境变量中配置。");
if (isPromptInjectionAttempt(source)) {
  console.error("测试被安全规则拒绝：请直接输入希望转达给对方的话。");
  process.exit(2);
}

async function requestRewrite(extraSystemInstruction = "") {
  const messages = [
    { role: "system", content: rephrasePrompt(audience) },
    ...(extraSystemInstruction ? [{ role: "system", content: extraSystemInstruction }] : []),
    { role: "user", content: `<source_text>\n${source}\n</source_text>` },
  ];
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages, temperature: extraSystemInstruction ? 0.1 : 0.15, response_format: { type: "json_object" } }),
    signal: AbortSignal.timeout(45_000),
  });
  if (!response.ok) throw new Error(`模型请求失败：HTTP ${response.status}`);
  const data = await response.json();
  const raw = data.choices?.[0]?.message?.content?.trim() || "";
  return { raw, rewrite: readRewrite(raw) };
}

console.log(`测试原话：${source}`);
console.log(`表达对象：${audience}`);
console.log(`使用模型：${model}`);

let result = await requestRewrite();
console.log(`首次模型原始输出：${result.raw}`);

if (!isUserPerspectiveRewrite(result.rewrite)) {
  console.log("首次输出未通过用户第一人称校验，正在自动重试…");
  result = await requestRewrite("上一版输出不合格：它像是在回应或安慰用户。现在只输出用户本人第一人称、可直接发送的转写 JSON。");
  console.log(`重试模型原始输出：${result.raw}`);
}

if (!isUserPerspectiveRewrite(result.rewrite)) throw new Error("最终输出仍未通过用户第一人称校验。");
console.log(`最终转写：${result.rewrite}`);
