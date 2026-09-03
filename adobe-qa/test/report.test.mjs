import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCanonicalReport,
  toCanonicalHtml,
  toCanonicalText,
} from "../src/report.mjs";

test("canonical report assigns every case to exactly one visible bucket", () => {
  const definitions = [
    { status: "PASS", reason: null },
    { status: "FAIL", reason: null },
    { status: "PLAN_FAIL", reason: null },
    {
      status: "NOT_TESTABLE",
      reason: "Multi-step video sequences are not supported",
    },
    {
      status: "NOT_TESTABLE",
      reason: "Target not resolved — nothing was measured",
      findings: [
        {
          code: "TARGET_NOT_RESOLVED",
          message: "No element matched this component",
        },
      ],
    },
    { status: "FAIL", reason: "Navigation timeout", findings: [] },
  ];
  const plan = {
    name: "Bucket test",
    cases: definitions.map(({ status }, index) => ({
      id: `case-${index}`,
      name: status,
      url: "https://example.com",
      planEvent: { id: "event1", name: "CTA Click" },
    })),
  };
  const captures = definitions.map(() => ({
    targetMatch: null,
    launch: null,
  }));
  const evaluations = definitions.map(({ status, reason, findings = [] }, index) => ({
    status,
    qaResult: status === "PASS" || status === "FAIL" ? status : null,
    canonical: {
      eventId: "event1",
      event: { canonicalName: "CTA Click" },
      claimedId: "event1",
      claimedName: "CTA Click",
    },
    findings,
    reason,
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
  assert.equal(report.summary.total, 6);
  assert.deepEqual(report.summary.buckets, {
    PASS: 1,
    FAIL: 2,
    PLAN_FAIL: 1,
    NOT_TESTABLE: 2,
  });
  assert.deepEqual(report.summary.outcomes, {
    CORRECT: 1,
    IMPLEMENTATION_ISSUE: 1,
    PLAN_ISSUE: 1,
    MANUAL_CHECK_REQUIRED: 1,
    COULD_NOT_RUN: 2,
  });
  assert.equal(
    Object.values(report.summary.buckets).reduce((sum, count) => sum + count, 0),
    report.summary.total
  );

  const output = toCanonicalText(report);
  for (const label of [
    "CORRECT",
    "IMPLEMENTATION ISSUE",
    "PLAN ISSUE",
    "MANUAL CHECK REQUIRED",
    "COULD NOT RUN",
  ]) {
    const count = label === "COULD NOT RUN" ? 2 : 1;
    assert.match(output, new RegExp(`=== ${label} \\(${count}\\) ===`));
  }
  for (const testCase of plan.cases) {
    assert.match(output, new RegExp(testCase.id));
  }
  assert.deepEqual(report.reservedEvents, ["event89"]);
  assert.match(output, /RESERVED WEB VITALS EVENTS/);
  assert.match(output, /reserved for the Web Vitals implementation/);
  assert.equal(
    report.cases[4].executionIssue.code,
    "COMPONENT_NOT_ON_PAGE"
  );
  assert.equal(report.cases[4].executionIssue.owner, "Plan");
  assert.equal(report.cases[5].executionIssue.code, "TIMEOUT");
  assert.equal(report.cases[5].executionIssue.owner, "Infrastructure");
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
  assert.equal(report.cases[0].outcome, "IMPLEMENTATION_ISSUE");
  assert.equal(report.cases[0].tests.dataLayer.checks.length, 1);
  assert.equal(report.cases[0].tests.debugger.checks.length, 2);
  assert.equal(
    report.cases[0].tests.debugger.checks[0].issueType,
    "WRONG_EVENT"
  );
  assert.equal(report.summary.fieldProblems.total, 2);
  assert.deepEqual(report.summary.fieldProblems.byType, {
    NOT_CAPTURED: 1,
    WRONG_EVENT: 1,
  });

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
  assert.match(html, /Implementation issue/);
  assert.match(html, /eVars 1\/1 · props 1\/1/);
  assert.match(html, /reference · not scored/);
});

test("field comparison unifies cross-cutting issues by variable", () => {
  const plan = {
    name: "Cross-cutting fields",
    cases: ["one", "two"].map((id) => ({
      id,
      name: `Case ${id}`,
      url: "https://example.com",
      expected: { eVars: { eVar2: "<Previous page>", eVar17: "<Link title>" } },
    })),
  };
  const evaluations = plan.cases.map((_, index) => ({
    status: "FAIL",
    qaResult: "FAIL",
    canonical: {
      eventId: "event2",
      event: { canonicalName: "Link Clicks" },
      claimedId: "event2",
      claimedName: "Link Clicks",
    },
    findings: [],
    reason: null,
    checks: [
      {
        key: "beacon.events",
        kind: "event",
        expected: "event2",
        actual: "event2",
        pass: true,
      },
      {
        key: "eVar2",
        kind: "dynamic",
        expected: "<Previous page>",
        actual: null,
        pass: false,
      },
      {
        key: "eVar17",
        kind: "dynamic",
        expected: "<Link title>",
        actual: index === 0 ? "N/A" : "Read more",
        pass: index !== 0,
        ...(index === 0
          ? { note: 'Placeholder value "N/A" carries no data' }
          : {}),
      },
    ],
    observedEvents: ["event2"],
    propsReference: {},
  }));
  const captures = plan.cases.map(() => ({
    dataLayerEvents: [],
    targetMatch: null,
    launch: null,
  }));

  const report = buildCanonicalReport(
    plan,
    captures,
    evaluations,
    "amznsproduction"
  );
  const eVar2 = report.fields.find((field) => field.key === "eVar2");
  assert.equal(eVar2.problems, 2);
  assert.deepEqual(eVar2.affectedCases, ["one", "two"]);
  assert.equal(eVar2.issueTypes.NOT_CAPTURED, 2);
  assert.equal(
    report.fields.find((field) => field.key === "eVar17").issueTypes
      .INVALID_VALUE,
    1
  );
  assert.match(report.insights[0].message, /likely shared tracking pattern/);
  assert.match(toCanonicalText(report), /UNIFIED DIAGNOSIS/);
  assert.match(toCanonicalHtml(report), /Comparison by field/);
});
