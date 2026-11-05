import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { checkDataLayerPush, planPushKeys } from "../src/dataLayerCheck.mjs";
import { detectVariableRoleDefects } from "../src/variableRoles.mjs";

const map = JSON.parse(
  await readFile(new URL("../knowledge/datalayer-map.json", import.meta.url), "utf8")
);
const sdr = JSON.parse(
  await readFile(new URL("../knowledge/wws-sdr.json", import.meta.url), "utf8")
);
const dictionary = sdr.byReportSuite.amznsproduction.dictionary;

const pushCode = `var adobeDataLayer = adobeDataLayer || [];
adobeDataLayer.push({
event: "CTA Clicks",
userInteraction: {
timestamp: <Timestamp>,
pageName: "Energy Spotlight",
ctaButton: <CTA button name/action>,
component: <C40>
}
});`;

test("plan push keys are read from the declared payload", () => {
  assert.deepEqual(planPushKeys(pushCode), [
    "timestamp",
    "pageName",
    "ctaButton",
    "component",
  ]);
});

test("data layer audit reports missing and undeclared keys with their eVars", () => {
  const audit = checkDataLayerPush({
    rawPushCode: pushCode,
    dataLayerEvent: {
      event: "Link Clicks",
      userInteraction: {
        timestamp: "09/02/2026",
        pageName: "Spotlight",
        component: "c40-dashboard",
        linkTitle: "Read more",
        destinationLink: "https://example.com",
      },
    },
    map,
    dictionary,
  });

  assert.deepEqual(audit.missing, ["ctaButton"]);
  assert.deepEqual(audit.undeclared.sort(), ["destinationLink", "linkTitle"]);
  assert.ok(
    audit.findings.some((finding) =>
      finding.message.includes("ctaButton → eVar12 (CTA Button)")
    )
  );
  assert.ok(
    audit.findings.some((finding) =>
      finding.message.includes("linkTitle → eVar17 (Link Title)")
    )
  );
  assert.ok(
    audit.findings.some((finding) =>
      finding.message.includes("destinationLink → eVar14 (Destination Link)")
    )
  );
});

test("asking Page Section for a component name is a plan fail, not a site failure", () => {
  const checks = [
    {
      key: "eVar28",
      kind: "fixed",
      expected: "Highlight Slider",
      actual: "main-content",
      pass: false,
    },
  ];
  const result = detectVariableRoleDefects(
    { feature: "Highlight Slider", target: { component: "C43" } },
    checks,
    dictionary
  );

  assert.equal(result.planLevelKeys.has("eVar28"), true);
  assert.equal(result.findings[0].code, "PLAN_VARIABLE_ROLE_MISMATCH");
  assert.match(result.findings[0].message, /Page Section/);
});

test("a missing Page Section value stays an implementation failure", () => {
  const result = detectVariableRoleDefects(
    { feature: "Highlight Slider", target: { component: "C43" } },
    [
      {
        key: "eVar28",
        kind: "fixed",
        expected: "Highlight Slider",
        actual: "N/A",
        pass: false,
      },
    ],
    dictionary
  );
  assert.equal(result.planLevelKeys.size, 0);
  assert.deepEqual(result.findings, []);
});

test("the visible case name can reveal a Page Section/component plan mixup", () => {
  const result = detectVariableRoleDefects(
    {
      name: "C40 Fact Card Image Large",
      target: { component: "c40-dashboard" },
    },
    [
      {
        key: "eVar28",
        kind: "fixed",
        expected: "Fact Card Image Large",
        actual: "optimize",
        pass: false,
      },
    ],
    dictionary
  );

  assert.equal(result.planLevelKeys.has("eVar28"), true);
  assert.equal(result.findings[0].code, "PLAN_VARIABLE_ROLE_MISMATCH");
});
