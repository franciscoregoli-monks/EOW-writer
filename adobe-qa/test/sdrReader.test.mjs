import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { zipSync, strToU8 } from "fflate";
import { readSdr } from "../src/sdrReader.mjs";

const sdr = JSON.parse(
  await readFile(new URL("../knowledge/wws-sdr.json", import.meta.url), "utf8")
);

test("committed WWS SDR artifact has eyeballable completeness counts", () => {
  assert.deepEqual(sdr.counts, {
    events: 37,
    eVars: 52,
    props: 3,
    dataLayerPushRows: 37,
    dataLayerPushReferences: 23,
    reportSuites: 3,
  });
});

test("SDR artifact keeps WWS report suites separate and canonical lookups intact", () => {
  assert.deepEqual(Object.keys(sdr.byReportSuite), [
    "amznsdevelopment",
    "amznsproduction",
    "amznsstaging",
  ]);
  for (const suite of Object.values(sdr.byReportSuite)) {
    assert.equal(suite.dictionary.events.event1.canonicalName, "CTA Click");
    assert.equal(suite.dictionary.events.event13.canonicalName, "Video Start");
    assert.equal(suite.dictionary.eVars.eVar45.canonicalName, "UTM Parameters");
    assert.equal(suite.dictionary.props.prop1.canonicalName, "Timestamp");
  }
});

test("SDR aliases include data-layer event names", () => {
  assert.equal(sdr.aliases["cta clicks"], "event1");
  assert.equal(sdr.aliases["link clicks"], "event2");
  assert.equal(sdr.aliases["video start"], "event13");
});

test("reader discovers shifted literal headers instead of assuming A1", async () => {
  const escape = (value) =>
    String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;");
  const cell = (ref, value) =>
    `<c r="${ref}" t="inlineStr"><is><t>${escape(value)}</t></is></c>`;
  const row = (number, cells) => `<row r="${number}">${cells.join("")}</row>`;
  const sheet = (rows) =>
    `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows.join("")}</sheetData></worksheet>`;
  const definitions = [
    [
      "Events",
      sheet([
        row(4, [
          cell("B4", "#"),
          cell("C4", "Friendly Name"),
          cell("D4", "Event Type"),
          cell("E4", "Description"),
        ]),
        row(5, [
          cell("B5", "event1"),
          cell("C5", "CTA Click (e1)"),
          cell("D5", "Counter"),
          cell("E5", "CTA"),
        ]),
      ]),
    ],
    [
      "Conversion Variables (eVars)",
      sheet([
        row(4, [
          cell("B4", "#"),
          cell("C4", "Variable (Friendly Name)"),
          cell("D4", "Description"),
        ]),
        row(5, [
          cell("B5", "1.0"),
          cell("C5", "Domain (v1)"),
          cell("D5", "Domain"),
        ]),
      ]),
    ],
    [
      "Traffic Variables (props)",
      sheet([
        row(4, [
          cell("B4", "#"),
          cell("C4", "Variable (Friendly Name)"),
          cell("D4", "Description"),
        ]),
        row(5, [
          cell("B5", "1.0"),
          cell("C5", "Timestamp (c1)"),
          cell("D5", "Timestamp"),
        ]),
      ]),
    ],
    [
      "Data Layer Pushes",
      sheet([
        row(4, [
          cell("B4", "Variable (Friendly Name)"),
          cell("C4", "Reference"),
          cell("D4", "Description"),
        ]),
        row(5, [
          cell("B5", "CTA Clicks (e1)"),
          cell("C5", 'adobeDataLayer.push({ event: "CTA Clicks" })'),
          cell("D5", "CTA"),
        ]),
      ]),
    ],
    [
      "Report Suites",
      sheet([
        row(6, [
          cell("B6", "RSID"),
          cell("C6", "Title"),
          cell("D6", "Description"),
        ]),
        row(7, [
          cell("B7", "amznsproduction"),
          cell("C7", "Production"),
          cell("D7", "WWS"),
        ]),
      ]),
    ],
  ];
  const workbookSheets = definitions
    .map(
      ([name], index) =>
        `<sheet name="${name}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`
    )
    .join("");
  const relationships = definitions
    .map(
      (_, index) =>
        `<Relationship Id="rId${index + 1}" Target="worksheets/sheet${index + 1}.xml"/>`
    )
    .join("");
  const files = {
    "xl/sharedStrings.xml": strToU8(
      '<?xml version="1.0"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"/>'
    ),
    "xl/workbook.xml": strToU8(
      `<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${workbookSheets}</sheets></workbook>`
    ),
    "xl/_rels/workbook.xml.rels": strToU8(
      `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relationships}</Relationships>`
    ),
  };
  definitions.forEach(([, xml], index) => {
    files[`xl/worksheets/sheet${index + 1}.xml`] = strToU8(xml);
  });
  const directory = await mkdtemp(path.join(os.tmpdir(), "sdr-test-"));
  const fixture = path.join(directory, "fixture.xlsx");
  await writeFile(fixture, zipSync(files));

  const parsed = await readSdr(fixture);
  assert.deepEqual(parsed.counts, {
    events: 1,
    eVars: 1,
    props: 1,
    dataLayerPushRows: 1,
    dataLayerPushReferences: 1,
    reportSuites: 1,
  });
  assert.equal(parsed.byReportSuite.amznsproduction.dictionary.events.event1.canonicalName, "CTA Click");
  assert.equal(parsed.aliases["cta clicks"], "event1");
});
