import assert from "node:assert/strict";
import test from "node:test";
import { chunkMarkdown, parseMarkdown, shouldInclude } from "../scripts/lib/knowledge.mjs";

test("解析 YAML frontmatter 和标题", () => {
  const parsed = parseMarkdown("---\ntitle: 潮热知识\nsource: 指南\ntopic: 症状\n---\n# 被覆盖标题\n正文");
  assert.equal(parsed.title, "潮热知识");
  assert.equal(parsed.metadata.source, "指南");
  assert.match(parsed.body, /正文/);
});

test("按标题分块且长文本有重叠", () => {
  const body = `# 第一节\n${"潮热相关内容。".repeat(100)}\n## 第二节\n睡眠内容。`;
  const chunks = chunkMarkdown(body, { maxChars: 160, overlapChars: 20 });
  assert.ok(chunks.length > 3);
  assert.equal(chunks.at(-1).heading, "第二节");
  assert.ok(chunks.every((chunk) => chunk.content.length <= 160));
  assert.ok(chunks.every((chunk) => /^[a-f0-9]{64}$/.test(chunk.contentHash)));
});

test("排除索引、说明和原始资料", () => {
  assert.equal(shouldInclude("01-基础/文章.md"), true);
  assert.equal(shouldInclude("README.md"), false);
  assert.equal(shouldInclude("00-索引.md"), false);
  assert.equal(shouldInclude("07-原始资料/全文.md"), false);
});
