import { readFile } from "node:fs/promises";
import path from "node:path";

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  const headers = lines[0].split(",").map((h) => h.trim());
  return lines.slice(1).filter(Boolean).map((line) => {
    const cols = [];
    let current = "";
    let quoted = false;
    for (const char of line) {
      if (char === '"') {
        quoted = !quoted;
        continue;
      }
      if (char === "," && !quoted) {
        cols.push(current);
        current = "";
        continue;
      }
      current += char;
    }
    cols.push(current);
    const row = {};
    headers.forEach((header, index) => {
      row[header] = (cols[index] ?? "").trim();
    });
    return row;
  });
}

function rowToCase(row) {
  const dataLayer = {};
  const beacon = {};
  for (const [key, value] of Object.entries(row)) {
    if (!value) continue;
    if (key.startsWith("dl.")) dataLayer[key.slice(3)] = value;
    if (key.startsWith("aa.")) beacon[key.slice(3)] = value;
  }
  return {
    id: row.id,
    name: row.name || row.id,
    url: row.url,
    action: row.action || "page_load",
    selector: row.selector || null,
    expected: {
      ...(Object.keys(dataLayer).length ? { dataLayer } : {}),
      ...(Object.keys(beacon).length ? { beacon } : {}),
    },
  };
}

export async function loadPlan(filePath) {
  const absolute = path.resolve(filePath);
  const raw = await readFile(absolute, "utf8");
  if (absolute.endsWith(".json")) {
    const plan = JSON.parse(raw);
    if (!Array.isArray(plan.cases) || plan.cases.length === 0) {
      throw new Error("Plan JSON must include a non-empty cases array");
    }
    return plan;
  }
  if (absolute.endsWith(".csv")) {
    const rows = parseCsv(raw);
    return {
      name: path.basename(absolute),
      adobe: {},
      cases: rows.map(rowToCase),
    };
  }
  throw new Error("Plan must be .json or .csv");
}
