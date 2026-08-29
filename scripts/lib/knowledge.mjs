import { createHash } from "node:crypto";

export function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function scalar(value) {
  const trimmed = value.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

export function parseMarkdown(source) {
  const normalized = source.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  const metadata = {};
  let body = normalized;
  if (normalized.startsWith("---\n")) {
    const end = normalized.indexOf("\n---\n", 4);
    if (end >= 0) {
      for (const line of normalized.slice(4, end).split("\n")) {
        const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
        if (match) metadata[match[1]] = scalar(match[2]);
      }
      body = normalized.slice(end + 5).trim();
    }
  }
  const firstHeading = body.match(/^#\s+(.+)$/m)?.[1]?.trim();
  return { metadata, body, title: metadata.title || firstHeading || "未命名资料" };
}

function sectionsOf(body) {
  const lines = body.split("\n");
  const sections = [];
  let heading = "正文";
  let buffer = [];
  for (const line of lines) {
    const match = line.match(/^(#{1,4})\s+(.+)$/);
    if (match && buffer.join("\n").trim()) {
      sections.push({ heading, text: buffer.join("\n").trim() });
      buffer = [];
    }
    if (match) heading = match[2].trim();
    buffer.push(line);
  }
  if (buffer.join("\n").trim()) sections.push({ heading, text: buffer.join("\n").trim() });
  return sections;
}

function splitLongText(text, maxChars, overlapChars) {
  if (text.length <= maxChars) return [text];
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + maxChars, text.length);
    if (end < text.length) {
      const floor = start + Math.floor(maxChars * 0.55);
      const candidates = ["\n\n", "。", "；", "！", "？", "\n"];
      for (const separator of candidates) {
        const position = text.lastIndexOf(separator, end);
        if (position >= floor) {
          end = position + separator.length;
          break;
        }
      }
    }
    const chunk = text.slice(start, end).trim();
    if (chunk) chunks.push(chunk);
    if (end >= text.length) break;
    start = Math.max(end - overlapChars, start + 1);
  }
  return chunks;
}

export function chunkMarkdown(body, options = {}) {
  const maxChars = options.maxChars ?? 800;
  const overlapChars = options.overlapChars ?? 100;
  const chunks = [];
  for (const section of sectionsOf(body)) {
    for (const content of splitLongText(section.text, maxChars, overlapChars)) {
      chunks.push({ heading: section.heading, content, contentHash: sha256(content) });
    }
  }
  return chunks;
}

export function shouldInclude(relativePath) {
  const path = relativePath.replaceAll("\\", "/");
  const file = path.split("/").at(-1) ?? "";
  return path.endsWith(".md") &&
    file !== "README.md" &&
    file !== "00-索引.md" &&
    !path.startsWith("07-原始资料/") &&
    !path.includes("/07-原始资料/");
}
