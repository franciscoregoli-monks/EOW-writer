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
});
