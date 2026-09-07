export function shanghaiDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function shanghaiMonth(now = new Date()): string {
  return shanghaiDate(now).slice(0, 7);
}

export function isIsoMonth(value: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

export function monthRange(month: string): { startDate: string; endDate: string } {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error("Invalid month");
  const [year, monthNumber] = month.split("-").map(Number);
  const start = new Date(Date.UTC(year, monthNumber - 1, 1));
  const end = new Date(Date.UTC(year, monthNumber, 0));
  return { startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10) };
}

export function reportStartDate(range: "1_month" | "3_months" | "6_months", endDate: string): string {
  const months = range === "1_month" ? 1 : range === "3_months" ? 3 : 6;
  const [year, month] = endDate.split("-").map(Number);
  // Previous N complete calendar months plus the current month through today.
  return new Date(Date.UTC(year, month - months - 1, 1)).toISOString().slice(0, 10);
}

function isoFromParts(year: number, month: number, day: number): string | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date.toISOString().slice(0, 10);
}

export function resolveRecordDate(text: string, now = new Date()): string {
  const current = shanghaiDate(now);
  const iso = text.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
  if (iso) {
    const value = isoFromParts(Number(iso[1]), Number(iso[2]), Number(iso[3]));
    return value && value <= current ? value : current;
  }
  const chinese = text.match(/(?:(20\d{2})年)?(\d{1,2})月(\d{1,2})日/);
  if (chinese) {
    let year = Number(chinese[1] ?? current.slice(0, 4));
    let value = isoFromParts(year, Number(chinese[2]), Number(chinese[3]));
    if (!chinese[1] && value && value > current) value = isoFromParts(--year, Number(chinese[2]), Number(chinese[3]));
    return value && value <= current ? value : current;
  }
  const days = text.includes("前天") ? 2 : text.includes("昨天") ? 1 : 0;
  if (!days) return current;
  const date = new Date(`${current}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

export interface DatedHealthText {
  recordDate: string;
  text: string;
}

/**
 * Splits one conversational turn into date-scoped facts. A date reference
 * applies to the words after it until the next reference; unqualified text is
 * recorded today. This keeps "昨天睡不好，今天食欲下降" as two daily cards.
 */
export function splitHealthTextByDate(text: string, now = new Date()): DatedHealthText[] {
  const marker = /\b20\d{2}-\d{1,2}-\d{1,2}\b|(?:(?:20\d{2})年)?\d{1,2}月\d{1,2}日|前天|昨天|今天/g;
  const matches = [...text.matchAll(marker)];
  if (matches.length === 0) return [{ recordDate: shanghaiDate(now), text }];

  const dated: DatedHealthText[] = [];
  const prefix = text.slice(0, matches[0].index).trim();
  if (prefix) dated.push({ recordDate: shanghaiDate(now), text: prefix });
  for (let index = 0; index < matches.length; index += 1) {
    const current = matches[index];
    const end = matches[index + 1]?.index ?? text.length;
    const chunk = text.slice(current.index, end).trim();
    if (chunk) dated.push({ recordDate: resolveRecordDate(current[0], now), text: chunk });
  }

  const groups = new Map<string, string[]>();
  for (const item of dated) groups.set(item.recordDate, [...(groups.get(item.recordDate) ?? []), item.text]);
  return [...groups].map(([recordDate, chunks]) => ({ recordDate, text: chunks.join("。") }));
}

export function resolveRecordMonth(text: string, now = new Date()): string {
  const current = shanghaiMonth(now);
  const explicit = text.match(/\b(20\d{2})-(0?[1-9]|1[0-2])\b/) ?? text.match(/(20\d{2})年(\d{1,2})月/);
  if (explicit) return `${explicit[1]}-${String(Number(explicit[2])).padStart(2, "0")}`;
  if (/上个?月/.test(text)) {
    const [year, month] = current.split("-").map(Number);
    return new Date(Date.UTC(year, month - 2, 1)).toISOString().slice(0, 7);
  }
  return current;
}
