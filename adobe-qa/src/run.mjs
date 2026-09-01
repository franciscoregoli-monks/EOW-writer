import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { capturePlan } from "./capture.mjs";
import { compareCase } from "./compare.mjs";
import { loadPlan } from "./loadPlan.mjs";
import { buildReport, toText } from "./report.mjs";

function arg(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  return process.argv[index + 1];
}

const planPath = arg("--plan", "examples/tcp-utm.plan.json");
const outDir = arg("--out", "reports");

const plan = await loadPlan(planPath);
const captures = await capturePlan(plan);
const comparisons = plan.cases.map((testCase, index) =>
  compareCase({
    expected: testCase.expected || {},
    dataLayerEvents: captures[index].dataLayerEvents,
    beacons: captures[index].beacons,
  })
);
const report = buildReport(plan, captures, comparisons);

await mkdir(outDir, { recursive: true });
const stamp = report.ranAt.replace(/[:.]/g, "-");
const jsonPath = path.join(outDir, `${stamp}.json`);
const textPath = path.join(outDir, `${stamp}.txt`);
await writeFile(jsonPath, JSON.stringify(report, null, 2));
await writeFile(textPath, toText(report));

const text = toText(report);
console.log(text);
console.log(`Wrote ${jsonPath}`);
console.log(`Wrote ${textPath}`);
process.exitCode = report.summary.failed ? 1 : 0;
