import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCanonicalReport,
  toCanonicalText,
} from "../src/report.mjs";

test("canonical report assigns every case to exactly one visible bucket", () => {
  const statuses = ["PASS", "FAIL", "PLAN_DEFECT", "NOT_TESTABLE"];
  const plan = {
    name: "Bucket test",
    cases: statuses.map((status, index) => ({
      id: `case-${index}`,
      name: status,
      url: "https://example.com",
      planEvent: { id: "event1", name: "CTA Click" },
    })),
  };
  const captures = statuses.map(() => ({
    targetMatch: null,
    launch: null,
  }));
  const evaluations = statuses.map((status, index) => ({
    status,
    qaResult: status === "PASS" || status === "FAIL" ? status : null,
    canonical: {
      eventId: "event1",
      event: { canonicalName: "CTA Click" },
      claimedId: "event1",
      claimedName: "CTA Click",
    },
    findings: [],
    reason: status === "NOT_TESTABLE" ? "unsupported" : null,
    checks: [],
    propsReference: {},
    reservedEvents: index === 0 ? ["event89"] : [],
  }));

  const report = buildCanonicalReport(
    plan,
    captures,
    evaluations,
    "amznsproduction"
  );
  assert.equal(report.summary.total, 4);
  assert.deepEqual(report.summary.buckets, {
    PASS: 1,
    FAIL: 1,
    PLAN_DEFECT: 1,
    NOT_TESTABLE: 1,
  });
  assert.equal(
    Object.values(report.summary.buckets).reduce((sum, count) => sum + count, 0),
    report.summary.total
  );

  const output = toCanonicalText(report);
  for (const status of statuses) {
    assert.match(output, new RegExp(`=== ${status} \\(1\\) ===`));
  }
  for (const testCase of plan.cases) {
    assert.match(output, new RegExp(testCase.id));
  }
  assert.deepEqual(report.reservedEvents, ["event89"]);
  assert.match(output, /RESERVED WEB VITALS EVENTS/);
  assert.match(output, /reserved for the Web Vitals implementation/);
});
