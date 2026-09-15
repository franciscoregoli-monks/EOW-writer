import { runQa } from "./runJob.mjs";

function arg(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  return process.argv[index + 1];
}

const result = await runQa({
  planPath: arg("--plan", "examples/tcp-utm.plan.json"),
  pptxPath: arg("--pptx", null),
  sheetUrl: arg("--sheet", null),
  eventsCsvPath: arg("--events-csv", null),
  pushesCsvPath: arg("--pushes-csv", null),
  url: arg("--url", null),
  suite: arg("--suite", null),
  sdrPath: arg("--sdr", null),
  outDir: arg("--out", "reports"),
  dlMapPath: arg("--dl-map", "knowledge/datalayer-map.json"),
});

console.log(result.text);
console.log(`Wrote ${result.jsonPath}`);
console.log(`Wrote ${result.textPath}`);
process.exitCode = result.failed ? 1 : 0;
