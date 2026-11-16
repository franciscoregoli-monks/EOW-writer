import assert from "node:assert/strict";
import test from "node:test";
import { capturePlan } from "../src/capture.mjs";

test("captures a data layer push before same-tab navigation", async () => {
  const page = encodeURIComponent(`
    <script>window.adobeDataLayer = [];</script>
    <a id="cta" href="about:blank"
      onclick="window.adobeDataLayer.push({
        event: 'CTA Clicks',
        userInteraction: { ctaButton: 'Report' }
      })">Report</a>
  `);
  const [capture] = await capturePlan(
    {
      adobe: { dataLayer: "adobeDataLayer" },
      cases: [
        {
          id: "navigating-cta",
          url: `data:text/html,${page}`,
          action: "click",
          selector: "#cta",
        },
      ],
    },
    { preActionSettleMs: 0, settleMs: 100 }
  );

  assert.equal(capture.error, null);
  assert.deepEqual(capture.dataLayerEvents, [
    {
      event: "CTA Clicks",
      userInteraction: { ctaButton: "Report" },
    },
  ]);
});

function beaconProbePlan(eVar12Values, expected = "Download") {
  const buttons = eVar12Values
    .map(
      (value, index) => `
        <button aria-label="Candidate ${index + 1}" onclick="
          const beacon = new Image();
          beacon.src = 'https://example.com/b/ss/test/1?events=event1&v12=${value}';
        ">Candidate ${index + 1}</button>
      `
    )
    .join("");
  const page = encodeURIComponent(`
    <script>window.adobeDataLayer = [];</script>
    <section data-component="c40-dashboard">${buttons}</section>
  `);
  return {
    adobe: { dataLayer: "adobeDataLayer" },
    cases: [
      {
        id: "ambiguous-download",
        url: `data:text/html,${page}`,
        action: "click",
        target: {
          component: "C40",
          controlType: "cta",
          planUnderspecified: true,
        },
        expected: {
          eVars: {
            eVar12: { kind: "fixed", value: expected, raw: `"${expected}"` },
          },
        },
      },
    ],
  };
}

test("selects the only ambiguous candidate whose beacon matches fixed eVar12", async () => {
  const captures = await capturePlan(
    beaconProbePlan(["Other", "Download", "Another"]),
    { preActionSettleMs: 0, settleMs: 100 }
  );
  const [capture] = captures;

  assert.equal(captures.length, 1);
  assert.equal(capture.error, null);
  assert.equal(capture.targetMatch.source, "beaconEVar12");
  assert.equal(capture.targetMatch.candidateIndex, 1);
  assert.equal(capture.targetMatch.expectedEVar12, "Download");
  assert.equal(capture.beacons[0].eVar12, "Download");
});

test("expands every distinguishable candidate whose beacon matches fixed eVar12", async () => {
  const captures = await capturePlan(
    beaconProbePlan(["Download", "Download"]),
    { preActionSettleMs: 0, settleMs: 100 }
  );

  assert.equal(captures.length, 2);
  assert.deepEqual(
    captures.map((capture) => capture.instance),
    [
      { type: "aria-label", value: "Candidate 1" },
      { type: "aria-label", value: "Candidate 2" },
    ]
  );
  assert.ok(captures.every((capture) => capture.beacons[0].eVar12 === "Download"));
});

test("keeps a target underspecified when no candidate matches fixed eVar12", async () => {
  const [capture] = await capturePlan(
    beaconProbePlan(["Other", "Another"]),
    { preActionSettleMs: 0, settleMs: 100 }
  );

  assert.equal(capture.error.code, "PLAN_UNDERSPECIFIED_TARGET");
});
