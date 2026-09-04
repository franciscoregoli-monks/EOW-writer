import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { readSdr } from "./sdrReader.mjs";

function arg(name, fallback) {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1];
}

const source = arg("--source");
const output = arg("--out", "knowledge/wws-sdr.json");

if (!source) {
  throw new Error("Usage: npm run sdr:build -- --source /path/to/sdr.xlsx");
}

const sdr = await readSdr(source);
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(sdr, null, 2)}\n`);

console.log(
  `SDR: ${sdr.counts.events} events, ${sdr.counts.eVars} eVars, ` +
    `${sdr.counts.props} props, ${sdr.counts.dataLayerPushReferences}/` +
    `${sdr.counts.dataLayerPushRows} pushes with references, ` +
    `${sdr.counts.reportSuites} report suites`
);
console.log(`Wrote ${output}`);
