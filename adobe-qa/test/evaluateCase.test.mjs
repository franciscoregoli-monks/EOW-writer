import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  evaluateCanonicalCase,
  preparePlan,
} from "../src/evaluateCase.mjs";

const sdr = JSON.parse(
  await readFile(new URL("../knowledge/wws-sdr.json", import.meta.url), "utf8")
);
const suite = "amznsproduction";

test("video and scroll are explicit NOT_TESTABLE cases", () => {
  const plan = preparePlan(
    {
      cases: [
        {
          id: "video",
          interactionType: "video",
          planEvent: { id: "event13", name: "Video Start" },
        },
        {
          id: "scroll",
          interactionType: "scroll",
          planEvent: { id: "event5", name: "Scroll Reach 25%" },
        },
      ],
    },
    sdr,
    suite
  );
  for (const item of plan.cases) {
    const result = evaluateCanonicalCase(item, { skipped: true }, sdr, suite);
    assert.equal(result.status, "NOT_TESTABLE");
    assert.match(result.reason, /not supported/i);
  }
});

test("events and eVars score; props remain reference-only", () => {
  const [item] = preparePlan(
    {
      cases: [
        {
          id: "link",
          interactionType: "link",
          planEvent: { id: "event2", name: "Link Clicks" },
          expected: {
            eVars: {
              eVar1: "<domain>",
              eVar10: '"Full Website"',
              eVar12: "removed",
            },
            props: { prop1: '"deliberately wrong"' },
          },
        },
      ],
    },
    sdr,
    suite
  ).cases;
  const result = evaluateCanonicalCase(
    item,
    {
      error: null,
      dataLayerEvents: [{ event: "Link Clicks" }],
      beacons: [
        {
          events: "event89,event2",
          eVar1: "sustainability.aboutamazon.com",
          eVar10: "Full Website",
          prop1: "actual timestamp",
        },
      ],
    },
    sdr,
    suite
  );
  assert.equal(result.status, "PASS");
  assert.equal(result.checks.every((check) => check.pass), true);
  assert.deepEqual(result.propsReference, {
    prop1: '"deliberately wrong"',
  });
  // The prop is compared so it is visible in the report, but a mismatch must
  // never change the verdict.
  assert.deepEqual(result.propChecks, [
    {
      key: "prop1",
      kind: "fixed",
      expected: "deliberately wrong",
      actual: "actual timestamp",
      pass: false,
      reference: true,
    },
  ]);
});

test("an anchor planned as CTA stays event1 and event2 is a real FAIL", () => {
  const [item] = preparePlan(
    {
      cases: [
        {
          id: "editorial-cta",
          interactionType: "cta",
          planEvent: { id: "event1", name: "CTA Clicks" },
          expected: { eVars: { eVar12: "<CTA label>" } },
        },
      ],
    },
    sdr,
    suite
  ).cases;
  const result = evaluateCanonicalCase(
    item,
    {
      error: null,
      targetMatch: { observedInteractionType: "link", href: "/internal-story" },
      dataLayerEvents: [
        {
          event: "Link Clicks",
          userInteraction: {
            destinationLink: "https://example.com/internal-story",
          },
        },
      ],
      beacons: [
        {
          events: "event89,event2",
          eVar14: "https://example.com/internal-story",
        },
      ],
    },
    sdr,
    suite
  );

  assert.equal(result.canonical.eventId, "event1");
  assert.equal(result.status, "FAIL");
  assert.equal(
    result.checks.find((check) => check.key === "beacon.events").actual,
    "event89,event2"
  );
  assert.equal(
    result.checks.find((check) => check.key === "eVar12").pass,
    false
  );
});
