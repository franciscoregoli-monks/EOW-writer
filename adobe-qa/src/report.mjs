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
  const cases = plan.cases.map((testCase, index) => ({
    id: testCase.id,
    name: testCase.name || testCase.id,
    url: testCase.url,
    action: testCase.action || "click",
    interactionType: testCase.interactionType || null,
    status: evaluations[index].status,
    qaResult: evaluations[index].qaResult,
    canonicalEvent: evaluations[index].canonical.eventId,
    canonicalName: evaluations[index].canonical.event?.canonicalName || null,
    planEvent: {
      id: evaluations[index].canonical.claimedId,
      name: evaluations[index].canonical.claimedName,
    },
    reason: evaluations[index].reason,
    findings: evaluations[index].findings,
    targetMatch: captures[index]?.targetMatch || null,
    launch: captures[index]?.launch || null,
    checks: evaluations[index].checks,
    propsReference: evaluations[index].propsReference,
    observedEvents: evaluations[index].observedEvents || [],
    reservedEvents: evaluations[index].reservedEvents || [],
    observed: {
      dataLayer: evaluations[index].dataLayerEvent || null,
      beacon: evaluations[index].beacon || null,
      allDataLayerEvents: (captures[index]?.dataLayerEvents || []).map(
        (event) => event?.event
      ),
    },
  }));

  const buckets = Object.fromEntries(
    ["PASS", "FAIL", "PLAN_DEFECT", "NOT_TESTABLE"].map((status) => [
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

function checkLine(check) {
  const marker = check.pageLevel ? "PAGE" : check.pass ? "PASS" : "FAIL";
  const semantics = check.kind && check.kind !== "event" ? ` [${check.kind}]` : "";
  return (
    `    ${marker} ${check.key}${semantics}` +
    ` | expected: ${JSON.stringify(check.expected)}` +
    ` | actual: ${JSON.stringify(check.actual)}`
  );
}

export function toCanonicalText(report) {
  const { buckets } = report.summary;
  const lines = [
    `Adobe QA — ${report.plan}`,
    `URL cases: ${report.summary.total} | Report suite dictionary: ${report.reportSuite}`,
    `PASS ${buckets.PASS} | FAIL ${buckets.FAIL} | PLAN_DEFECT ${buckets.PLAN_DEFECT} | NOT_TESTABLE ${buckets.NOT_TESTABLE}`,
  ];
  if (report.planStats) {
    lines.push(
      `Plan cases: ${report.planStats.totalItems} | Pushes matched: ${report.planStats.matched} | Unmatched: ${report.planStats.unmatched}`
    );
  }
  lines.push("");

  if (report.pageFindings?.length) {
    lines.push(
      `=== PAGE-LEVEL PLAN DEFECTS (${report.pageFindings.length}) ===`,
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

  for (const status of ["PASS", "FAIL", "PLAN_DEFECT", "NOT_TESTABLE"]) {
    const cases = report.cases.filter((testCase) => testCase.status === status);
    if (!cases.length) continue;
    lines.push(`=== ${status} (${cases.length}) ===`);
    for (const testCase of cases) {
      lines.push(
        `${testCase.id} — ${testCase.name}`,
        `  canonical: ${testCase.canonicalEvent || "unresolved"} (${testCase.canonicalName || "unknown"})`
      );
      if (testCase.planEvent.id || testCase.planEvent.name) {
        lines.push(
          `  plan: ${testCase.planEvent.name || "unnamed"} / ${testCase.planEvent.id || "no ID"}`
        );
      }
      if (testCase.qaResult) lines.push(`  implementation QA: ${testCase.qaResult}`);
      if (testCase.observedEvents?.length) {
        lines.push(`  site actually fired: ${testCase.observedEvents.join(", ")}`);
      }
      if (testCase.reason) lines.push(`  reason: ${testCase.reason}`);
      if (testCase.targetMatch) {
        lines.push(
          `  target: ${testCase.targetMatch.source} (${testCase.targetMatch.confidence})`
        );
      }
      for (const finding of testCase.findings) {
        lines.push(`  finding ${finding.code}: ${finding.message}`);
      }
      for (const check of testCase.checks) lines.push(checkLine(check));
      const props = Object.keys(testCase.propsReference || {});
      if (props.length) {
        lines.push(`  props (reference only, not scored): ${props.join(", ")}`);
      }
      lines.push("");
    }
  }
  return lines.join("\n");
}
