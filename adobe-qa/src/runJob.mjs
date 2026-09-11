import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { toCanonicalText, toText } from "./report.mjs";
import { executeQa } from "./runQa.mjs";

export async function runQa({
  planPath = "examples/tcp-utm.plan.json",
  pptxPath = null,
  sheetUrl = null,
  eventsCsvPath = null,
  pushesCsvPath = null,
  url = null,
  suite = null,
  sdrPath = null,
  outDir = "reports",
  dlMapPath = "knowledge/datalayer-map.json",
} = {}) {
  const usesSheet = Boolean(sheetUrl || eventsCsvPath || pushesCsvPath);
  const usesCanonicalSource = usesSheet || Boolean(pptxPath);
  const effectiveSdrPath =
    sdrPath || (usesCanonicalSource ? "knowledge/wws-sdr.json" : null);

  if (effectiveSdrPath && !suite) {
    throw new Error("--suite is required with --sdr");
  }

  const report = await executeQa({
    planPath,
    pptxPath,
    sheetUrl,
    eventsCsvPath,
    pushesCsvPath,
    url,
    reportSuite: suite,
    sdrPath: effectiveSdrPath,
    dataLayerMapPath: dlMapPath,
  });
  const text = effectiveSdrPath
    ? toCanonicalText(report)
    : toText(report);
  const failed = effectiveSdrPath
    ? report.summary.buckets.FAIL > 0
    : report.summary.failed > 0;

  await mkdir(outDir, { recursive: true });
  const stamp = report.ranAt.replace(/[:.]/g, "-");
  const jsonPath = path.join(outDir, `${stamp}.json`);
  const textPath = path.join(outDir, `${stamp}.txt`);
  await writeFile(jsonPath, JSON.stringify(report, null, 2));
  await writeFile(textPath, text);

  return { report, text, failed, jsonPath, textPath };
}
