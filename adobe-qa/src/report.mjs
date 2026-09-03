import { planEvars, planProps } from "./valueSemantics.mjs";

export const OUTCOME_LABELS = {
  CORRECT: "Correct",
  IMPLEMENTATION_ISSUE: "Implementation issue",
  PLAN_ISSUE: "Plan issue",
  MANUAL_CHECK_REQUIRED: "Manual check required",
  COULD_NOT_RUN: "Could not run",
};

function outcomeFor(evaluation) {
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
  if (check.pass) return { ...check, issueType: null };
  if (/placeholder/i.test(check.note || "")) {
    return { ...check, issueType: "INVALID_PLACEHOLDER" };
  }
  if (check.actual == null || check.actual === "") {
    return { ...check, issueType: "MISSING" };
  }
  if (check.key === "beacon.events" || check.key === "dataLayer.event") {
    return { ...check, issueType: "WRONG_EVENT" };
  }
  return { ...check, issueType: "WRONG_VALUE" };
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
    const checks = (evaluation.checks || []).map(classifyCheck);
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
    summary: { total: cases.length, buckets, outcomes },
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
  const { outcomes } = report.summary;
  const lines = [
    `Adobe QA — ${report.plan}`,
    `URL cases: ${report.summary.total} | Report suite dictionary: ${report.reportSuite}`,
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
</head>
<body>
  <main class="wrap">
    <h1>Adobe QA</h1>
    <p class="sub">${escapeHtml(report.plan)} · ${report.summary.total} tests · ${escapeHtml(report.reportSuite)}</p>
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
