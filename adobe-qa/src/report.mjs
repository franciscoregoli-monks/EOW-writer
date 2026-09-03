import { planEvars, planProps } from "./valueSemantics.mjs";

export const OUTCOME_LABELS = {
  CORRECT: "Correct",
  IMPLEMENTATION_ISSUE: "Implementation issue",
  PLAN_ISSUE: "Plan issue",
  MANUAL_CHECK_REQUIRED: "Manual check required",
  COULD_NOT_RUN: "Could not run",
};

function outcomeFor(evaluation) {
  if (
    evaluation.findings?.some(
      (finding) => finding.code === "NO_TRACKING_FIRED"
    )
  ) {
    return "IMPLEMENTATION_ISSUE";
  }
  if (evaluation.status === "PASS") return "CORRECT";
  if (evaluation.status === "PLAN_FAIL") return "PLAN_ISSUE";
  if (evaluation.status === "NOT_TESTABLE") {
    return /not supported|multi-step/i.test(evaluation.reason || "")
      ? "MANUAL_CHECK_REQUIRED"
      : "COULD_NOT_RUN";
  }
  if (
    evaluation.status === "FAIL" &&
    !evaluation.checks?.length &&
    evaluation.reason
  ) {
    return "COULD_NOT_RUN";
  }
  return "IMPLEMENTATION_ISSUE";
}

function classifyCheck(check) {
  if (check.pageLevel) {
    return { ...check, issueType: "PLAN_VALUE_MISMATCH" };
  }
  if (check.planLevel) {
    return { ...check, issueType: "PLAN_VARIABLE_ROLE" };
  }
  if (check.pass) return { ...check, issueType: null };
  if (/placeholder/i.test(check.note || "")) {
    return { ...check, issueType: "INVALID_VALUE" };
  }
  if (check.actual == null || check.actual === "") {
    return { ...check, issueType: "NOT_CAPTURED" };
  }
  if (check.key === "beacon.events" || check.key === "dataLayer.event") {
    return { ...check, issueType: "WRONG_EVENT" };
  }
  return { ...check, issueType: "WRONG_VALUE" };
}

function presentedChecks(evaluation) {
  if (
    evaluation.findings?.some(
      (finding) => finding.code === "NO_TRACKING_FIRED"
    )
  ) {
    return [
      {
        key: "dataLayer.event",
        kind: "event",
        expected:
          evaluation.canonical.event?.canonicalName ||
          evaluation.canonical.eventId,
        actual: null,
        pass: false,
      },
      {
        key: "beacon.events",
        kind: "event",
        expected: evaluation.canonical.eventId,
        actual: null,
        pass: false,
      },
    ];
  }
  return evaluation.checks || [];
}

function executionIssueFor(evaluation, capture) {
  if (outcomeFor(evaluation) !== "COULD_NOT_RUN") return null;
  const reason = `${evaluation.reason || ""} ${capture?.error?.message || ""}`;
  if (
    evaluation.findings?.some(
      (finding) => finding.code === "TARGET_NOT_RESOLVED"
    )
  ) {
    return {
      code: "COMPONENT_NOT_ON_PAGE",
      label: "Component not on page",
      owner: "Plan",
    };
  }
  if (/timeout|timed out/i.test(reason)) {
    return { code: "TIMEOUT", label: "Timeout", owner: "Infrastructure" };
  }
  if (/401|403|unauthori[sz]ed|forbidden|access denied/i.test(reason)) {
    return {
      code: "ACCESS_BLOCKED",
      label: "Access blocked",
      owner: "Environment",
    };
  }
  return {
    code: "TECHNICAL_ERROR",
    label: "Technical error",
    owner: "Infrastructure",
  };
}

function uniqueValues(values) {
  const seen = new Map();
  for (const value of values) {
    const key = JSON.stringify(value);
    if (!seen.has(key)) seen.set(key, value);
  }
  return [...seen.values()];
}

function fieldComparison(cases) {
  const fields = new Map();
  const add = (testCase, layer, check) => {
    if (!fields.has(check.key)) {
      fields.set(check.key, {
        key: check.key,
        layer,
        checks: 0,
        correct: 0,
        problems: 0,
        expected: [],
        actual: [],
        affectedCases: [],
        issueTypes: {},
        occurrences: [],
      });
    }
    const field = fields.get(check.key);
    const diagnosticPass = !check.issueType;
    field.checks += 1;
    field.correct += diagnosticPass ? 1 : 0;
    field.problems += diagnosticPass ? 0 : 1;
    field.expected.push(check.expected);
    field.actual.push(check.actual);
    if (!diagnosticPass) field.affectedCases.push(testCase.id);
    if (check.issueType) {
      field.issueTypes[check.issueType] =
        (field.issueTypes[check.issueType] || 0) + 1;
    }
    field.occurrences.push({
      caseId: testCase.id,
      caseName: testCase.name,
      expected: check.expected,
      actual: check.actual,
      pass: diagnosticPass,
      issueType: check.issueType,
      reference: Boolean(check.reference),
    });
  };

  for (const testCase of cases) {
    for (const check of testCase.tests.dataLayer.checks) {
      add(testCase, "Data Layer", check);
    }
    for (const check of testCase.tests.debugger.checks) {
      add(testCase, "Adobe Debugger", check);
    }
    for (const check of testCase.tests.debugger.propChecks || []) {
      add(testCase, "Adobe Debugger · reference", check);
    }
    const audit = testCase.tests.dataLayer.audit;
    for (const key of audit?.missing || []) {
      add(testCase, "Data Layer payload", classifyCheck({
        key,
        expected: "Declared in plan push",
        actual: null,
        pass: false,
      }));
    }
    for (const key of audit?.undeclared || []) {
      add(testCase, "Data Layer payload", {
        key,
        expected: "Not declared in plan push",
        actual: "Present",
        pass: false,
        issueType: "UNEXPECTED",
      });
    }
  }

  return [...fields.values()]
    .map((field) => ({
      ...field,
      expected: uniqueValues(field.expected),
      actual: uniqueValues(field.actual),
      affectedCases: [...new Set(field.affectedCases)],
    }))
    .sort((a, b) => {
      if (a.problems !== b.problems) return b.problems - a.problems;
      return a.key.localeCompare(b.key, undefined, { numeric: true });
    });
}

function unifiedInsights(fields, pageFindings) {
  const insights = [];
  for (const field of fields.filter((item) => item.problems >= 2)) {
    const issue = Object.entries(field.issueTypes).sort(
      (a, b) => b[1] - a[1]
    )[0]?.[0];
    if (
      issue === "PLAN_VALUE_MISMATCH" &&
      pageFindings?.some((finding) => finding.key === field.key)
    ) {
      continue;
    }
    const behavior = {
      NOT_CAPTURED: "was not captured",
      INVALID_VALUE: "sent analytically invalid values",
      WRONG_EVENT: "sent a different event",
      WRONG_VALUE: "sent values that did not match the plan",
      UNEXPECTED: "appeared without being declared by the plan",
      PLAN_VALUE_MISMATCH: "contains a repeated plan/page mismatch",
      PLAN_VARIABLE_ROLE: "is assigned the wrong semantic role by the plan",
    }[issue] || "failed comparison";
    const planPattern = issue?.startsWith("PLAN_");
    insights.push({
      code: "CROSS_CUTTING_FIELD_PATTERN",
      scope: planPattern ? "plan" : "cross-cutting",
      field: field.key,
      affectedCases: field.affectedCases,
      message:
        `${field.key} ${behavior} in ${field.problems}/${field.checks} ` +
        `comparisons across ${field.affectedCases.length} cases. This is a ` +
        (planPattern
          ? "repeated plan pattern rather than separate implementation bugs; correct the plan once."
          : "likely shared tracking pattern rather than an isolated component bug; review the common data-layer/Launch mapping first."),
    });
  }

  if (pageFindings?.length) {
    insights.push({
      code: "PAGE_PLAN_PATTERN",
      scope: "plan",
      fields: pageFindings.map((finding) => finding.key),
      message:
        `${pageFindings.map((finding) => finding.key).join(", ")} differ ` +
        "consistently across the page. Treat them as one page-level plan " +
        "correction, not repeated component defects.",
    });
  }

  const isolated = fields.filter((field) => field.problems === 1);
  if (isolated.length) {
    insights.push({
      code: "ISOLATED_FIELD_ISSUES",
      scope: "isolated",
      fields: isolated.map((field) => field.key),
      message:
        `${isolated.length} field problem${isolated.length === 1 ? "" : "s"} ` +
        `occurred in only one case (${isolated.map((field) => field.key).join(", ")}). ` +
        "Investigate these at component level.",
    });
  }
  return insights;
}

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
    const checks = presentedChecks(evaluation).map(classifyCheck);
    const dataLayerChecks = checks.filter((check) =>
      check.key.startsWith("dataLayer.")
    );
    const debuggerChecks = checks.filter(
      (check) => !check.key.startsWith("dataLayer.")
    );
    const propChecks = (evaluation.propChecks || []).map(classifyCheck);
    return {
      id: testCase.id,
      name: testCase.name || testCase.id,
      url: testCase.url,
      action: testCase.action || "click",
      interactionType: testCase.interactionType || null,
      status: evaluation.status,
      outcome: outcomeFor(evaluation),
      executionIssue: executionIssueFor(evaluation, captures[index]),
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
  const outcomes = Object.fromEntries(
    Object.keys(OUTCOME_LABELS).map((outcome) => [
      outcome,
      cases.filter((testCase) => testCase.outcome === outcome).length,
    ])
  );
  const fields = fieldComparison(cases);
  const fieldProblemsByType = {};
  for (const field of fields) {
    for (const [type, count] of Object.entries(field.issueTypes)) {
      fieldProblemsByType[type] = (fieldProblemsByType[type] || 0) + count;
    }
  }
  const fieldProblems = {
    total: fields.reduce((sum, field) => sum + field.problems, 0),
    byType: fieldProblemsByType,
  };
  const insights = unifiedInsights(fields, pageFindings);
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
    summary: { total: cases.length, fieldProblems, buckets, outcomes },
    fields,
    insights,
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
    (check.issueType ? ` | issue: ${check.issueType.replaceAll("_", " ").toLowerCase()}` : "") +
    (check.note ? ` | ${check.note}` : "")
  );
}

function auditLine(label, values) {
  return `    ${label}: ${values?.length ? values.join(", ") : "none"}`;
}

export function toCanonicalText(report) {
  const { fieldProblems, outcomes } = report.summary;
  const problemBreakdown = Object.entries(fieldProblems.byType)
    .map(
      ([type, count]) =>
        `${type.replaceAll("_", " ").toLowerCase()} ${count}`
    )
    .join(" | ");
  const lines = [
    `Adobe QA — ${report.plan}`,
    `URL cases: ${report.summary.total} | Report suite dictionary: ${report.reportSuite}`,
    `FIELD-LEVEL PROBLEMS ${fieldProblems.total}${problemBreakdown ? ` | ${problemBreakdown}` : ""}`,
    Object.entries(OUTCOME_LABELS)
      .map(([key, label]) => `${label.toUpperCase()} ${outcomes[key]}`)
      .join(" | "),
  ];
  if (report.planStats) {
    lines.push(
      `Plan cases: ${report.planStats.totalItems} | Pushes matched: ${report.planStats.matched} | Unmatched: ${report.planStats.unmatched}`
    );
  }
  lines.push("");

  if (report.insights?.length) {
    lines.push("=== UNIFIED DIAGNOSIS ===");
    for (const insight of report.insights) {
      lines.push(`- ${insight.message}`);
    }
    lines.push("");
  }

  lines.push(`=== FIELD COMPARISON (${report.fields.length}) ===`);
  for (const field of report.fields) {
    const issues = Object.entries(field.issueTypes)
      .map(
        ([type, count]) =>
          `${type.replaceAll("_", " ").toLowerCase()} ${count}`
      )
      .join(", ");
    lines.push(
      `${field.key} · ${field.layer} | problems ${field.problems}/${field.checks}` +
        (issues ? ` | ${issues}` : " | correct"),
      `  expected: ${JSON.stringify(field.expected)}`,
      `  actual: ${JSON.stringify(field.actual)}`,
      `  affected cases: ${field.affectedCases.length ? field.affectedCases.join(", ") : "none"}`
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

  for (const outcome of Object.keys(OUTCOME_LABELS)) {
    const cases = report.cases.filter((testCase) => testCase.outcome === outcome);
    if (!cases.length) continue;
    const label = OUTCOME_LABELS[outcome].toUpperCase();
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
      if (testCase.executionIssue) {
        lines.push(
          `    blocker: ${testCase.executionIssue.label} | owner: ${testCase.executionIssue.owner}`
        );
      }

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

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function htmlValue(value) {
  return escapeHtml(JSON.stringify(value));
}

function htmlChecks(checks = []) {
  if (!checks.length) {
    return '<p class="empty">No comparable evidence was captured.</p>';
  }
  return `
    <div class="checks">
      ${checks
        .map(
          (check) => `
            <div class="check ${check.pass ? "check-pass" : "check-fail"}">
              <span class="check-mark">${check.pass ? "✓" : "×"}</span>
              <div>
                <strong>${escapeHtml(check.key)}</strong>
                ${check.reference ? '<span class="reference">reference · not scored</span>' : ""}
                ${check.issueType ? `<span class="reference">${escapeHtml(check.issueType.replaceAll("_", " ").toLowerCase())}</span>` : ""}
                <p>Expected: <code>${htmlValue(check.expected)}</code></p>
                <p>Actual: <code>${htmlValue(check.actual)}</code></p>
                ${check.note ? `<p class="note">${escapeHtml(check.note)}</p>` : ""}
              </div>
            </div>`
        )
        .join("")}
    </div>`;
}

export function toCanonicalHtml(report) {
  const outcomes = report.summary.outcomes;
  const fieldProblemBreakdown = Object.entries(
    report.summary.fieldProblems.byType
  )
    .map(
      ([type, count]) =>
        `${count} ${type.replaceAll("_", " ").toLowerCase()}`
    )
    .join(" · ");
  const fieldRows = report.fields
    .map(
      (field) => `
        <tr class="${field.problems ? "problem-row" : ""}">
          <td><code>${escapeHtml(field.key)}</code><small>${escapeHtml(field.layer)}</small></td>
          <td>${field.problems}/${field.checks}<small>${escapeHtml(Object.entries(field.issueTypes).map(([type, count]) => `${count} ${type.replaceAll("_", " ").toLowerCase()}`).join(", ") || "correct")}</small></td>
          <td><code>${htmlValue(field.expected)}</code></td>
          <td><code>${htmlValue(field.actual)}</code></td>
          <td>${escapeHtml(field.affectedCases.join(", ") || "—")}</td>
        </tr>`
    )
    .join("");
  const caseCards = report.cases
    .map((testCase) => {
      const dataLayer = testCase.tests?.dataLayer || {};
      const debuggerTest = testCase.tests?.debugger || {};
      const coverage = testCase.coverage;
      return `
        <article class="case">
          <header>
            <div>
              <span class="case-id">${escapeHtml(testCase.id)}</span>
              <h2>${escapeHtml(testCase.name)}</h2>
              <p>${escapeHtml(testCase.action)}${testCase.interactionType ? ` · ${escapeHtml(testCase.interactionType)}` : ""}</p>
            </div>
            <span class="badge badge-${testCase.outcome.toLowerCase()}">${OUTCOME_LABELS[testCase.outcome]}</span>
          </header>
          <div class="contract">
            <span>Expected event</span>
            <strong>${escapeHtml(testCase.canonicalEvent || "unresolved")}</strong>
            <span>${escapeHtml(testCase.canonicalName || "unknown")}</span>
            <span>Observed</span>
            <strong>${escapeHtml(testCase.observedEvents?.join(", ") || "none")}</strong>
          </div>
          ${
            coverage
              ? `<p class="coverage">Plan coverage · event ${coverage.eventChecked ? "compared" : "not compared"} · eVars ${coverage.eVars.compared}/${coverage.eVars.declared} · props ${coverage.props.compared}/${coverage.props.declared}${coverage.notCompared.length ? ` · not compared: ${escapeHtml(coverage.notCompared.join(", "))}` : ""}</p>`
              : ""
          }
          <div class="evidence">
            <section>
              <h3>Data Layer <span class="badge badge-${String(dataLayer.result || "NOT_TESTABLE").toLowerCase().replaceAll(" ", "_")}">${escapeHtml(dataLayer.result || "NOT TESTABLE")}</span></h3>
              ${htmlChecks(dataLayer.checks)}
            </section>
            <section>
              <h3>Adobe Debugger <span class="badge badge-${String(debuggerTest.result || "NOT_TESTABLE").toLowerCase().replaceAll(" ", "_")}">${escapeHtml(debuggerTest.result || "NOT TESTABLE")}</span></h3>
              ${htmlChecks(debuggerTest.checks)}
              ${
                debuggerTest.propChecks?.length
                  ? `<h4>Props (reference only)</h4>${htmlChecks(debuggerTest.propChecks)}`
                  : ""
              }
            </section>
          </div>
          ${
            testCase.reason || testCase.findings?.length
              ? `<div class="findings"><strong>Findings</strong>
                  ${testCase.reason ? `<p>${escapeHtml(testCase.reason)}</p>` : ""}
                  ${testCase.executionIssue ? `<p><code>${escapeHtml(testCase.executionIssue.label)}</code> · owner: ${escapeHtml(testCase.executionIssue.owner)}</p>` : ""}
                  ${(testCase.findings || []).map((finding) => `<p><code>${escapeHtml(finding.code)}</code> ${escapeHtml(finding.message)}</p>`).join("")}
                </div>`
              : ""
          }
        </article>`;
    })
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Adobe QA — ${escapeHtml(report.plan)}</title>
  <style>
    :root{color-scheme:dark;--bg:#0b0d10;--surface:#12151a;--soft:#1b2027;--border:#2a3039;--text:#f4f6f8;--muted:#98a1ad;--pass:#43c78a;--fail:#ff6b6b;--plan:#f3b95f;--unknown:#94a0b0}
    *{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:14px/1.5 Arial,sans-serif}.wrap{max-width:1280px;margin:auto;padding:48px 24px 80px}h1{font-size:36px;letter-spacing:-.04em;margin:0}.sub{color:var(--muted);margin:8px 0 28px}.summary{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:28px}.metric,.case{background:var(--surface);border:1px solid var(--border);border-radius:12px}.metric{padding:16px}.metric strong{display:block;font-size:28px}.metric span{color:var(--muted);font-size:12px}.case{margin:12px 0;overflow:hidden}.case>header{display:flex;justify-content:space-between;gap:16px;padding:20px}.case h2{font-size:17px;margin:5px 0 0}.case header p{color:var(--muted);margin:2px 0 0}.case-id,code{font-family:ui-monospace,monospace}.case-id{color:var(--muted);font-size:11px}.badge{border:1px solid currentColor;border-radius:999px;font-size:10px;font-weight:700;padding:4px 8px;white-space:nowrap}.badge-pass,.badge-correct{color:var(--pass)}.badge-fail,.badge-implementation_issue{color:var(--fail)}.badge-plan_fail,.badge-plan_issue{color:var(--plan)}.badge-not_testable,.badge-manual_check_required,.badge-could_not_run{color:var(--unknown)}.contract{display:flex;flex-wrap:wrap;gap:9px;background:#0e1115;border-block:1px solid var(--border);color:var(--muted);font-size:12px;padding:10px 20px}.contract strong{color:var(--text)}.coverage{color:var(--muted);font-size:11px;margin:0;padding:10px 20px;border-bottom:1px solid var(--border)}.evidence{display:grid;grid-template-columns:1fr 1fr;gap:0}.evidence>section{padding:18px 20px}.evidence>section+section{border-left:1px solid var(--border)}h3{align-items:center;display:flex;font-size:13px;justify-content:space-between;margin:0 0 10px}h4{color:var(--muted);font-size:11px;margin:20px 0 8px;text-transform:uppercase}.check{border-top:1px solid var(--border);display:grid;gap:8px;grid-template-columns:18px 1fr;padding:10px 0}.check-mark{font-size:18px}.check-pass .check-mark{color:var(--pass)}.check-fail .check-mark{color:var(--fail)}.check strong{font-family:ui-monospace,monospace;font-size:11px}.check p{color:var(--muted);font-size:11px;margin:3px 0}.reference{background:var(--soft);border-radius:4px;color:var(--muted);font-size:9px;margin-left:7px;padding:2px 5px}.note{color:var(--plan)!important}.empty{color:var(--muted);font-size:12px}.findings{background:rgba(243,185,95,.06);border-top:1px solid var(--border);color:var(--muted);font-size:11px;padding:14px 20px}.findings p{margin:5px 0}.page-finds{background:rgba(243,185,95,.07);border:1px solid rgba(243,185,95,.3);border-radius:10px;color:var(--plan);margin-bottom:20px;padding:14px}.page-finds p{margin:5px 0}@media(max-width:760px){.summary{grid-template-columns:1fr 1fr}.evidence{grid-template-columns:1fr}.evidence>section+section{border-left:0;border-top:1px solid var(--border)}}@media print{body{background:#fff;color:#111}.metric,.case{break-inside:avoid;background:#fff;border-color:#ccc}.contract{background:#f5f5f5}.sub,.case header p,.contract,.coverage,.check p,.findings{color:#555}}
  </style>
  <style>
    .diagnostic{background:var(--surface);border:1px solid var(--border);border-radius:12px;margin-bottom:20px;padding:18px}
    .diagnostic h2,.fields h2{font-size:17px;margin:0 0 8px}.diagnostic>strong{display:block;font-size:28px}.diagnostic>.breakdown{color:var(--muted);margin:0 0 16px}.insight{border-top:1px solid var(--border);padding:10px 0}.insight:last-child{padding-bottom:0}.insight strong{color:var(--muted);font-size:10px;text-transform:uppercase}.insight p{margin:3px 0}.fields{margin-bottom:28px;overflow:auto}.fields table{border-collapse:collapse;width:100%}.fields th,.fields td{border-bottom:1px solid var(--border);font-size:11px;padding:10px;text-align:left;vertical-align:top}.fields th{color:var(--muted);font-size:9px;text-transform:uppercase}.fields td small{color:var(--muted);display:block;margin-top:3px}.fields .problem-row{background:rgba(255,107,107,.035)}
  </style>
</head>
<body>
  <main class="wrap">
    <h1>Adobe QA</h1>
    <p class="sub">${escapeHtml(report.plan)} · ${report.summary.total} tests · ${escapeHtml(report.reportSuite)}</p>
    <section class="diagnostic">
      <h2>Field-level problems</h2>
      <strong>${report.summary.fieldProblems.total}</strong>
      <p class="breakdown">${escapeHtml(fieldProblemBreakdown || "No field problems")}</p>
      ${(report.insights || []).map((insight) => `<div class="insight"><strong>${escapeHtml(insight.scope)} insight</strong><p>${escapeHtml(insight.message)}</p></div>`).join("")}
    </section>
    <section class="fields">
      <h2>Comparison by field</h2>
      <table>
        <thead><tr><th>Field</th><th>Problems</th><th>Expected from plan</th><th>Actual captured</th><th>Affected cases</th></tr></thead>
        <tbody>${fieldRows}</tbody>
      </table>
    </section>
    <section class="summary">
      ${Object.keys(OUTCOME_LABELS).map((outcome) => `<div class="metric"><strong>${outcomes[outcome]}</strong><span>${OUTCOME_LABELS[outcome]}</span></div>`).join("")}
    </section>
    ${
      report.pageFindings?.length
        ? `<section class="page-finds"><strong>Page-level plan corrections</strong>${report.pageFindings.map((finding) => `<p>${escapeHtml(finding.key)}: plan ${htmlValue(finding.expected)} · page ${htmlValue(finding.actual)}</p>`).join("")}</section>`
        : ""
    }
    ${caseCards}
  </main>
</body>
</html>`;
}
