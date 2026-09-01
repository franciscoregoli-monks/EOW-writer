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
