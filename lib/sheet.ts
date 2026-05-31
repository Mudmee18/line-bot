export interface FaqRow {
  question: string;
  answer: string;
  category: string;
}

interface Cache {
  data: FaqRow[];
  fetchedAt: number;
}

const CACHE_TTL_MS = 60 * 1000; // 60 วินาที

let cache: Cache | null = null;

function parseCsv(raw: string): FaqRow[] {
  const lines = raw.trim().split("\n");
  if (lines.length < 2) return [];

  const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const qIdx = header.indexOf("question");
  const aIdx = header.indexOf("answer");
  const cIdx = header.indexOf("category");

  return lines.slice(1).reduce<FaqRow[]>((acc, line) => {
    // รองรับ field ที่ครอบ "" และมี comma ข้างใน
    const cols = splitCsvLine(line);
    const question = cols[qIdx]?.trim() ?? "";
    const answer = cols[aIdx]?.trim() ?? "";
    const category = cols[cIdx]?.trim() ?? "";
    if (question && answer) acc.push({ question, answer, category });
    return acc;
  }, []);
}

function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

export async function getFaq(): Promise<FaqRow[]> {
  const now = Date.now();

  if (cache && now - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.data;
  }

  const url = process.env.SHEET_CSV_URL;
  if (!url) {
    console.error("[sheet] SHEET_CSV_URL is not set");
    return cache?.data ?? [];
  }

  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const raw = await res.text();
    const data = parseCsv(raw);
    cache = { data, fetchedAt: now };
    return data;
  } catch (err) {
    console.error("[sheet] fetch failed:", err);
    return cache?.data ?? [];
  }
}

export function faqToText(rows: FaqRow[]): string {
  return rows
    .map((r) => `Q: ${r.question}\nA: ${r.answer}`)
    .join("\n\n");
}
