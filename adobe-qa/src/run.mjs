import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { capturePlan } from "./capture.mjs";
import { compareCase } from "./compare.mjs";
import {
  evaluateCanonicalCase,
  preparePlan,
  rollUpPageLevelFindings,
} from "./evaluateCase.mjs";
import { loadPlan } from "./loadPlan.mjs";
import {
  buildCanonicalReport,
  buildReport,
  toCanonicalText,
  toText,
} from "./report.mjs";
import { loadSheetPlan } from "./sheetPlanParser.mjs";
import { loadPptxPlan } from "./pptxPlanParser.mjs";

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
let plan = pptxPath
  ? await loadPptxPlan({ filePath: pptxPath, url: urlOverride })
  : usesSheet
    ? await loadSheetPlan({
      sheetUrl,
      eventsCsvPath,
      pushesCsvPath,
      url: urlOverride,
    })
    : await loadPlan(planPath);
if (urlOverride) {
  plan = {
    ...plan,
    cases: plan.cases.map((testCase) => ({ ...testCase, url: urlOverride })),
  };
}

let report;
let text;
let failed;
if (sdrPath) {
  if (!reportSuite) throw new Error("--suite is required with --sdr");
  const sdr = JSON.parse(await readFile(path.resolve(sdrPath), "utf8"));
  const prepared = preparePlan(plan, sdr, reportSuite);
  const captures = await capturePlan(prepared);
  const rawEvaluations = prepared.cases.map((testCase, index) =>
    evaluateCanonicalCase(testCase, captures[index], sdr, reportSuite)
  );
  const { evaluations, pageFindings } =
    rollUpPageLevelFindings(rawEvaluations);
  report = buildCanonicalReport(
    prepared,
    captures,
    evaluations,
    reportSuite,
    pageFindings
  );
  text = toCanonicalText(report);
  failed = report.summary.buckets.FAIL > 0;
} else {
  const captures = await capturePlan(plan);
  const comparisons = plan.cases.map((testCase, index) =>
    compareCase({
      expected: testCase.expected || {},
      dataLayerEvents: captures[index].dataLayerEvents,
      beacons: captures[index].beacons,
    })
  );
  report = buildReport(plan, captures, comparisons);
  text = toText(report);
  failed = report.summary.failed > 0;
}

await mkdir(outDir, { recursive: true });
const stamp = report.ranAt.replace(/[:.]/g, "-");
const jsonPath = path.join(outDir, `${stamp}.json`);
const textPath = path.join(outDir, `${stamp}.txt`);
await writeFile(jsonPath, JSON.stringify(report, null, 2));
await writeFile(textPath, text);

console.log(text);
console.log(`Wrote ${jsonPath}`);
console.log(`Wrote ${textPath}`);
process.exitCode = failed ? 1 : 0;
