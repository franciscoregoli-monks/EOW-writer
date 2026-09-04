import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { capturePlan } from "./capture.mjs";
import { compareCase } from "./compare.mjs";
import {
  evaluateCanonicalCase,
  preparePlan,
  rollUpPageLevelFindings,
} from "./evaluateCase.mjs";
import { loadPlan } from "./loadPlan.mjs";
import { loadPptxPlan } from "./pptxPlanParser.mjs";
import {
  buildCanonicalReport,
  buildReport,
} from "./report.mjs";
import { loadSheetPlan } from "./sheetPlanParser.mjs";

const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);

function projectPath(relativePath) {
  return path.isAbsolute(relativePath)
    ? relativePath
    : path.join(PROJECT_ROOT, relativePath);
}

function expandCapturedCases(plan, captures) {
  const sourceCases = new Map(
    plan.cases.map((testCase) => [testCase.id, testCase])
  );
  return {
    ...plan,
    cases: captures.map((capture) => {
      const source = sourceCases.get(capture.sourceCaseId || capture.id);
      if (!source) {
        throw new Error(`Capture ${capture.id} has no source plan case`);
      }
      return capture.instance
        ? {
            ...source,
            id: capture.id,
            name: capture.name,
            instance: capture.instance,
          }
        : source;
    }),
  };
}

export async function executeQa({
  planPath,
  pptxPath,
  sheetUrl,
  eventsCsvPath,
  pushesCsvPath,
  url,
  reportSuite = "amznsproduction",
  sdrPath = "knowledge/wws-sdr.json",
  dataLayerMapPath = "knowledge/datalayer-map.json",
  captureOptions,
}) {
  const usesSheet = Boolean(sheetUrl || eventsCsvPath || pushesCsvPath);
  let plan = pptxPath
    ? await loadPptxPlan({ filePath: pptxPath, url })
    : usesSheet
      ? await loadSheetPlan({
          sheetUrl,
          eventsCsvPath,
          pushesCsvPath,
          url,
        })
      : await loadPlan(planPath);

  if (url) {
    plan = {
      ...plan,
      cases: plan.cases.map((testCase) => ({ ...testCase, url })),
    };
  }

  const usesCanonicalEvaluation = Boolean(
    pptxPath || usesSheet || sdrPath
  );
  if (!usesCanonicalEvaluation) {
    const captures = await capturePlan(plan, captureOptions);
    const capturedPlan = expandCapturedCases(plan, captures);
    const comparisons = capturedPlan.cases.map((testCase, index) =>
      compareCase({
        expected: testCase.expected || {},
        dataLayerEvents: captures[index].dataLayerEvents,
        beacons: captures[index].beacons,
      })
    );
    return buildReport(capturedPlan, captures, comparisons);
  }

  if (!reportSuite) {
    throw new Error("A report suite is required for SDR evaluation");
  }
  const [sdr, dataLayerMap] = await Promise.all([
    readFile(projectPath(sdrPath), "utf8").then(JSON.parse),
    readFile(projectPath(dataLayerMapPath), "utf8").then(JSON.parse),
  ]);
  const prepared = preparePlan(plan, sdr, reportSuite);
  const captures = await capturePlan(prepared, captureOptions);
  const capturedPlan = expandCapturedCases(prepared, captures);
  const rawEvaluations = capturedPlan.cases.map((testCase, index) =>
    evaluateCanonicalCase(
      testCase,
      captures[index],
      sdr,
      reportSuite,
      dataLayerMap
    )
  );
  const { evaluations, pageFindings } =
    rollUpPageLevelFindings(rawEvaluations);
  return buildCanonicalReport(
    capturedPlan,
    captures,
    evaluations,
    reportSuite,
    pageFindings
  );
}
