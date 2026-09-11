import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  toCanonicalHtml,
  toCanonicalText,
  toText,
} from "./report.mjs";
import { executeQa } from "./runQa.mjs";

function arg(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  return process.argv[index + 1];
}

const planPath = arg("--plan", "examples/tcp-utm.plan.json");
const outDir = arg("--out", "reports");
const sdrPathArg = arg("--sdr", null);
const reportSuite = arg("--suite", null);
const urlOverride = arg("--url", null);
const sheetUrl = arg("--sheet", null);
const eventsCsvPath = arg("--events-csv", null);
const pushesCsvPath = arg("--pushes-csv", null);
const pptxPath = arg("--pptx", null);

const usesSheet = Boolean(sheetUrl || eventsCsvPath || pushesCsvPath);
const usesCanonicalSource = usesSheet || Boolean(pptxPath);
const sdrPath =
  sdrPathArg || (usesCanonicalSource ? "knowledge/wws-sdr.json" : null);
if (sdrPath && !reportSuite) throw new Error("--suite is required with --sdr");

const report = await executeQa({
  planPath,
  pptxPath,
  sheetUrl,
  eventsCsvPath,
  pushesCsvPath,
  url: urlOverride,
  reportSuite,
  sdrPath,
  dataLayerMapPath: arg("--dl-map", "knowledge/datalayer-map.json"),
});
const text = sdrPath ? toCanonicalText(report) : toText(report);
const failed = sdrPath
  ? report.summary.buckets.FAIL > 0
  : report.summary.failed > 0;

await mkdir(outDir, { recursive: true });
const stamp = report.ranAt.replace(/[:.]/g, "-");
const jsonPath = path.join(outDir, `${stamp}.json`);
const textPath = path.join(outDir, `${stamp}.txt`);
const htmlPath = sdrPath ? path.join(outDir, `${stamp}.html`) : null;
await Promise.all([
  writeFile(jsonPath, JSON.stringify(report, null, 2)),
  writeFile(textPath, text),
  ...(htmlPath ? [writeFile(htmlPath, toCanonicalHtml(report))] : []),
]);

console.log(text);
console.log(`Wrote ${jsonPath}`);
console.log(`Wrote ${textPath}`);
if (htmlPath) console.log(`Wrote ${htmlPath}`);
process.exitCode = failed ? 1 : 0;
