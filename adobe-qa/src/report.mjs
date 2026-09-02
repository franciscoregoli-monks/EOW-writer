import { planEvars, planProps } from "./valueSemantics.mjs";

// The plan text box is the contract, so the report states how many of its
// declared fields were actually compared instead of only the headline event.
function planCoverage(testCase, checks, propChecks) {
  const declaredEvars = Object.keys(planEvars(testCase));
  const declaredProps = Object.keys(planProps(testCase));
  const compared = new Set([...checks, ...propChecks].map((check) => check.key));
  return {
    eventChecked: checks.some((check) => check.key === "beacon.events"),
    eVars: {
      declared: declaredEvars.length,
      compared: declaredEvars.filter((key) => compared.has(key)).length,
    },
    props: {
      declared: declaredProps.length,
      compared: declaredProps.filter((key) => compared.has(key)).length,
    },
    notCompared: [...declaredEvars, ...declaredProps].filter(
      (key) => !compared.has(key)
    ),
  };
}

export function buildReport(plan, captures, comparisons) {
  const cases = plan.cases.map((testCase, index) => {
    const capture = captures[index];
    const comparison = comparisons[index];
    return {
      id: testCase.id,
      name: testCase.name || testCase.id,
      url: testCase.url,
      action: testCase.action || "page_load",
      pass: Boolean(comparison?.pass) && !capture.error,
      error: capture.error,
      launch: capture.launch,
      finalUrl: capture.finalUrl,
      dataLayerEvents: capture.dataLayerEvents,
      beacon: comparison?.beacon ?? capture.beacons[0] ?? null,
      checks: comparison?.checks ?? [],
    };
  });

  const passed = cases.filter((item) => item.pass).length;
  return {
    plan: plan.name,
    ranAt: new Date().toISOString(),
    summary: {
      total: cases.length,
      passed,
      failed: cases.length - passed,
    },
    cases,
  };
}

export function toText(report) {
  const lines = [
    `Adobe QA: ${report.plan}`,
    `Ran: ${report.ranAt}`,
    `Result: ${report.summary.passed}/${report.summary.total} passed`,
    "",
  ];
  for (const testCase of report.cases) {
    lines.push(`${testCase.pass ? "PASS" : "FAIL"}  ${testCase.id}  ${testCase.name}`);
    if (testCase.error) lines.push(`  error: ${testCase.error}`);
    if (testCase.launch) {
      lines.push(
        `  launch: ${testCase.launch.property || "unknown"} (${testCase.launch.environment || "n/a"})`
      );
    }
    for (const check of testCase.checks) {
      const mark = check.note && check.pass ? "  !! " : check.pass ? "  ok " : "  xx ";
      lines.push(
        `${mark}${check.path}: expected=${JSON.stringify(check.expected)} actual=${JSON.stringify(check.actual)}${check.note ? ` (${check.note})` : ""}`
      );
    }
    lines.push("");
  }
  return lines.join("\n");
}

export function buildCanonicalReport(
  plan,
  captures,
  evaluations,
  reportSuite,
  pageFindings = []
) {
  const cases = plan.cases.map((testCase, index) => {
    const evaluation = evaluations[index];
    const checks = evaluation.checks || [];
    const dataLayerChecks = checks.filter((check) =>
      check.key.startsWith("dataLayer.")
    );
    const debuggerChecks = checks.filter(
      (check) => !check.key.startsWith("dataLayer.")
    );
    const propChecks = evaluation.propChecks || [];
    return {
      id: testCase.id,
      name: testCase.name || testCase.id,
      url: testCase.url,
      action: testCase.action || "click",
      interactionType: testCase.interactionType || null,
      status: evaluation.status,
      qaResult: evaluation.qaResult,
      canonicalEvent: evaluation.canonical.eventId,
      canonicalName: evaluation.canonical.event?.canonicalName || null,
      planEvent: {
        id: evaluation.canonical.claimedId,
        name: evaluation.canonical.claimedName,
      },
      reason: evaluation.reason,
      findings: evaluation.findings,
      targetMatch: captures[index]?.targetMatch || null,
      launch: captures[index]?.launch || null,
      checks,
      tests: {
        dataLayer: {
          result: checkResult(dataLayerChecks),
          checks: dataLayerChecks,
          audit: evaluation.dataLayerAudit || null,
          observed: evaluation.dataLayerEvent || null,
        },
        debugger: {
          result: checkResult(debuggerChecks),
          checks: debuggerChecks,
          propChecks,
          observedEvents: evaluation.observedEvents || [],
          beacon: evaluation.beacon || null,
        },
      },
      coverage: planCoverage(testCase, checks, propChecks),
      propsReference: evaluation.propsReference,
      observedEvents: evaluation.observedEvents || [],
      reservedEvents: evaluation.reservedEvents || [],
      observed: {
        dataLayer: evaluation.dataLayerEvent || null,
        beacon: evaluation.beacon || null,
        allDataLayerEvents: (captures[index]?.dataLayerEvents || []).map(
          (event) => event?.event
        ),
      },
    };
  });

  const buckets = Object.fromEntries(
    ["PASS", "FAIL", "PLAN_FAIL", "NOT_TESTABLE"].map((status) => [
      status,
      cases.filter((testCase) => testCase.status === status).length,
    ])
  );
  const undocumentedEvents = [
    ...new Set(evaluations.flatMap((item) => item.undocumentedEvents || [])),
  ].sort();
  const reservedEvents = [
    ...new Set(evaluations.flatMap((item) => item.reservedEvents || [])),
  ].sort();

  return {
    plan: plan.name,
    reportSuite,
    planStats: plan.stats || null,
    pageFindings,
    reservedEvents,
    undocumentedEvents,
    ranAt: new Date().toISOString(),
    summary: { total: cases.length, buckets },
    cases,
  };
}

function checkResult(checks) {
  if (!checks.length) return "NOT TESTABLE";
  return checks.every((check) => check.pass) ? "PASS" : "FAIL";
}

function checkLine(check) {
  const marker = check.reference
    ? "REF "
    : check.pageLevel
      ? "PAGE"
      : check.pass
        ? "PASS"
        : "FAIL";
  const semantics = check.kind && check.kind !== "event" ? ` [${check.kind}]` : "";
  return (
    `    ${marker} ${check.key}${semantics}` +
    ` | expected: ${JSON.stringify(check.expected)}` +
    ` | actual: ${JSON.stringify(check.actual)}` +
    (check.note ? ` | ${check.note}` : "")
  );
}

function auditLine(label, values) {
  return `    ${label}: ${values?.length ? values.join(", ") : "none"}`;
}

export function toCanonicalText(report) {
  const { buckets } = report.summary;
  const lines = [
    `Adobe QA — ${report.plan}`,
    `URL cases: ${report.summary.total} | Report suite dictionary: ${report.reportSuite}`,
    `PASS ${buckets.PASS} | FAIL ${buckets.FAIL} | PLAN FAIL ${buckets.PLAN_FAIL} | NOT TESTABLE ${buckets.NOT_TESTABLE}`,
  ];
  if (report.planStats) {
    lines.push(
      `Plan cases: ${report.planStats.totalItems} | Pushes matched: ${report.planStats.matched} | Unmatched: ${report.planStats.unmatched}`
    );
  }
  lines.push("");

  if (report.pageFindings?.length) {
    lines.push(
      `=== PAGE-LEVEL PLAN FAILS (${report.pageFindings.length}) ===`,
      "Reported once for the whole page. Excluded from per-component scoring.",
      ""
    );
    for (const finding of report.pageFindings) {
      lines.push(
        `${finding.code} · ${finding.key} (all ${finding.cases} measured components)`,
        `  plan: ${JSON.stringify(finding.expected)}`,
        `  page: ${JSON.stringify(finding.actual)}`,
        ""
      );
    }
  }

  if (report.reservedEvents?.length) {
    lines.push(
      `=== RESERVED WEB VITALS EVENTS (${report.reservedEvents.length}) ===`,
      `${report.reservedEvents.join(", ")} are part of the event85–event89 ` +
        "range reserved for the Web Vitals implementation currently in progress.",
      "They are expected housekeeping events and do not affect component QA.",
      ""
    );
  }

  if (report.undocumentedEvents?.length) {
    lines.push(
      `=== EVENTS NOT IN THE SDR (${report.undocumentedEvents.length}) ===`,
      `${report.undocumentedEvents.join(", ")} fired on captured hits but are ` +
        `absent from the ${report.reportSuite} dictionary.`,
      "Observed alongside web-vitals link names (CLS/INP/LCP/TTFB/FCP).",
      ""
    );
  }

  for (const status of ["PASS", "FAIL", "PLAN_FAIL", "NOT_TESTABLE"]) {
    const cases = report.cases.filter((testCase) => testCase.status === status);
    if (!cases.length) continue;
    const label = status.replaceAll("_", " ");
    lines.push(`=== ${label} (${cases.length}) ===`);
    for (const testCase of cases) {
      lines.push(
        `${testCase.id} — ${testCase.name}`,
        "  TEST",
        `    URL: ${testCase.url || "not provided"}`,
        `    action: ${testCase.action}${testCase.interactionType ? ` (${testCase.interactionType})` : ""}`,
        `    expected event: ${testCase.canonicalEvent || "unresolved"} (${testCase.canonicalName || "unknown"})`
      );
      if (testCase.planEvent.id || testCase.planEvent.name) {
        lines.push(
          `    plan says: ${testCase.planEvent.name || "unnamed"} / ${testCase.planEvent.id || "no ID"}`
        );
      }
      if (testCase.targetMatch) {
        lines.push(
          `    target: ${testCase.targetMatch.source} (${testCase.targetMatch.confidence})`
        );
      }
      if (testCase.qaResult) lines.push(`    overall implementation QA: ${testCase.qaResult}`);
      if (testCase.reason) lines.push(`    reason: ${testCase.reason}`);

      const dataLayerTest = testCase.tests?.dataLayer || {
        result: checkResult(
          testCase.checks.filter((check) => check.key.startsWith("dataLayer."))
        ),
        checks: testCase.checks.filter((check) =>
          check.key.startsWith("dataLayer.")
        ),
      };
      lines.push("", `  DATA LAYER TEST — ${dataLayerTest.result}`);
      if (dataLayerTest.checks.length) {
        for (const check of dataLayerTest.checks) lines.push(checkLine(check));
      } else {
        lines.push("    No comparable data layer push was captured.");
      }
      if (dataLayerTest.audit) {
        lines.push(
          auditLine("declared keys", dataLayerTest.audit.expectedKeys),
          auditLine("observed keys", dataLayerTest.audit.actualKeys),
          auditLine("missing", dataLayerTest.audit.missing),
          auditLine("undeclared", dataLayerTest.audit.undeclared),
          auditLine("placeholder values", dataLayerTest.audit.placeholders),
          auditLine("unmapped", dataLayerTest.audit.unmapped)
        );
      }

      const debuggerTest = testCase.tests?.debugger || {
        result: checkResult(
          testCase.checks.filter(
            (check) => !check.key.startsWith("dataLayer.")
          )
        ),
        checks: testCase.checks.filter(
          (check) => !check.key.startsWith("dataLayer.")
        ),
        observedEvents: testCase.observedEvents,
      };
      lines.push("", `  ADOBE DEBUGGER TEST — ${debuggerTest.result}`);
      if (debuggerTest.observedEvents?.length) {
        lines.push(`    observed events: ${debuggerTest.observedEvents.join(", ")}`);
      }
      if (debuggerTest.checks.length) {
        for (const check of debuggerTest.checks) lines.push(checkLine(check));
      } else {
        lines.push("    No comparable Adobe interaction beacon was captured.");
      }
      if (debuggerTest.propChecks?.length) {
        lines.push("    Props (compared, never scored):");
        for (const check of debuggerTest.propChecks) {
          lines.push(checkLine(check));
        }
      }
      if (testCase.coverage) {
        const { eVars, props, notCompared } = testCase.coverage;
        lines.push(
          `    plan coverage: event ${testCase.coverage.eventChecked ? "compared" : "not compared"}` +
            ` | eVars ${eVars.compared}/${eVars.declared}` +
            ` | props ${props.compared}/${props.declared}` +
            (notCompared.length
              ? ` | not compared: ${notCompared.join(", ")}`
              : "")
        );
      }

      if (testCase.findings.length) {
        lines.push("", "  FINDINGS");
        for (const finding of testCase.findings) {
          lines.push(`    ${finding.code}: ${finding.message}`);
        }
      }
      lines.push("");
    }
  }
  return lines.join("\n");
}
