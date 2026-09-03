import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCanonicalReport,
  toCanonicalHtml,
  toCanonicalText,
} from "../src/report.mjs";

test("canonical report assigns every case to exactly one visible bucket", () => {
  const statuses = ["PASS", "FAIL", "PLAN_FAIL", "NOT_TESTABLE"];
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
    PLAN_FAIL: 1,
    NOT_TESTABLE: 1,
  });
  assert.equal(
    Object.values(report.summary.buckets).reduce((sum, count) => sum + count, 0),
    report.summary.total
  );

  const output = toCanonicalText(report);
  for (const status of statuses) {
    assert.match(
      output,
      new RegExp(`=== ${status.replaceAll("_", " ")} \\(1\\) ===`)
    );
  }
  for (const testCase of plan.cases) {
    assert.match(output, new RegExp(testCase.id));
  }
  assert.deepEqual(report.reservedEvents, ["event89"]);
  assert.match(output, /RESERVED WEB VITALS EVENTS/);
  assert.match(output, /reserved for the Web Vitals implementation/);
});

test("canonical report separates the data layer and debugger tests", () => {
  const plan = {
    name: "Separated output",
    cases: [
      {
        id: "cta-1",
        name: "Hero CTA",
        url: "https://example.com/story",
        action: "click hero CTA",
        interactionType: "cta",
        expected: {
          eVars: { eVar14: "<Link Title>" },
          props: { prop1: "<Timestamp>" },
        },
      },
    ],
  };
  const captures = [
    {
      targetMatch: { source: "selector", confidence: "confirmed" },
      dataLayerEvents: [{ event: "CTA Click" }],
    },
  ];
  const evaluations = [
    {
      status: "FAIL",
      qaResult: "FAIL",
      canonical: {
        eventId: "event1",
        event: { canonicalName: "CTA Click" },
        claimedId: "event1",
        claimedName: "CTA Click",
      },
      findings: [
        {
          code: "DL_KEY_MISSING",
          message: "Plan push declares linkTitle but the page did not send it",
        },
      ],
      checks: [
        {
          key: "dataLayer.event",
          kind: "event",
          expected: "CTA Click",
          actual: "CTA Click",
          pass: true,
        },
        {
          key: "beacon.events",
          kind: "event",
          expected: "event1",
          actual: "event2",
          pass: false,
        },
        {
          key: "eVar14",
          kind: "dynamic",
          expected: "<Link Title>",
          actual: "Read more",
          pass: true,
        },
      ],
      dataLayerAudit: {
        expectedKeys: ["linkTitle", "destinationLink"],
        actualKeys: ["destinationLink"],
        missing: ["linkTitle"],
        undeclared: [],
        placeholders: [],
        unmapped: [],
      },
      dataLayerEvent: { event: "CTA Click" },
      beacon: { events: "event2", eVar14: "Read more" },
      observedEvents: ["event2"],
      propChecks: [
        {
          key: "prop1",
          kind: "dynamic",
          expected: "<Timestamp>",
          actual: "09/02/2026",
          pass: true,
          reference: true,
        },
      ],
      propsReference: { prop1: "<Timestamp>" },
    },
  ];

  const report = buildCanonicalReport(
    plan,
    captures,
    evaluations,
    "amznsproduction"
  );
  assert.equal(report.cases[0].tests.dataLayer.result, "PASS");
  assert.equal(report.cases[0].tests.debugger.result, "FAIL");
  assert.equal(report.cases[0].tests.dataLayer.checks.length, 1);
  assert.equal(report.cases[0].tests.debugger.checks.length, 2);

  const output = toCanonicalText(report);
  const testAt = output.indexOf("  TEST");
  const dataLayerAt = output.indexOf("  DATA LAYER TEST — PASS");
  const debuggerAt = output.indexOf("  ADOBE DEBUGGER TEST — FAIL");
  const findingsAt = output.indexOf("  FINDINGS");
  assert.ok(testAt < dataLayerAt);
  assert.ok(dataLayerAt < debuggerAt);
  assert.ok(debuggerAt < findingsAt);
  assert.match(output, /action: click hero CTA \(cta\)/);
  assert.match(output, /missing: linkTitle/);
  assert.match(output, /observed events: event2/);

  // Every field the plan slide declares must be accounted for, not only the
  // headline event and its most relevant eVar.
  assert.deepEqual(report.cases[0].coverage, {
    eventChecked: true,
    eVars: { declared: 1, compared: 1 },
    props: { declared: 1, compared: 1 },
    notCompared: [],
  });
  assert.match(output, /Props \(compared, never scored\)/);
  assert.match(output, /REF {2}prop1/);
  assert.match(
    output,
    /plan coverage: event compared \| eVars 1\/1 \| props 1\/1/
  );

  const html = toCanonicalHtml(report);
  assert.match(html, /<!doctype html>/);
  assert.match(html, /Data Layer/);
  assert.match(html, /Adobe Debugger/);
  assert.match(html, /eVars 1\/1 · props 1\/1/);
  assert.match(html, /reference · not scored/);
});
