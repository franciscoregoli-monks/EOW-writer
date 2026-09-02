"use client";

import {
  AlertCircle,
  BarChart3,
  CheckCircle2,
  ChevronDown,
  CircleSlash2,
  Download,
  FileSpreadsheet,
  FlaskConical,
  LoaderCircle,
  Play,
  Search,
  Upload,
  XCircle,
} from "lucide-react";
import { useMemo, useState } from "react";

const STATUS_META = {
  PASS: { label: "Pass", icon: CheckCircle2 },
  FAIL: { label: "Fail", icon: XCircle },
  PLAN_FAIL: { label: "Plan fail", icon: AlertCircle },
  NOT_TESTABLE: { label: "Not testable", icon: CircleSlash2 },
};

function StatusBadge({ status }) {
  const meta = STATUS_META[status] || STATUS_META.NOT_TESTABLE;
  const Icon = meta.icon;
  return (
    <span className={`status status-${status.toLowerCase()}`}>
      <Icon size={14} aria-hidden="true" />
      {meta.label}
    </span>
  );
}

function CheckRow({ check }) {
  return (
    <div className="check-row">
      {check.pageLevel ? (
        <AlertCircle className="check-page" size={17} />
      ) : check.pass ? (
        <CheckCircle2 className="check-pass" size={17} />
      ) : (
        <XCircle className="check-fail" size={17} />
      )}
      <div>
        <div className="check-key">
          {check.key}
          {check.kind && check.kind !== "event" && (
            <span className="kind">{check.kind}</span>
          )}
        </div>
        <div className="comparison">
          <span>Expected: {JSON.stringify(check.expected)}</span>
          <span>Actual: {JSON.stringify(check.actual)}</span>
        </div>
        {check.note && <p className="check-note">{check.note}</p>}
      </div>
    </div>
  );
}

function AuditGrid({ audit }) {
  if (!audit) return null;
  const items = [
    ["Declared", audit.expectedKeys],
    ["Observed", audit.actualKeys],
    ["Missing", audit.missing],
    ["Undeclared", audit.undeclared],
    ["Placeholders", audit.placeholders],
    ["Unmapped", audit.unmapped],
  ];
  return (
    <div className="audit-grid">
      {items.map(([label, values]) => (
        <div key={label} className={values?.length && label !== "Declared" && label !== "Observed" ? "audit-problem" : ""}>
          <span>{label}</span>
          <strong>{values?.length ? values.join(", ") : "None"}</strong>
        </div>
      ))}
    </div>
  );
}

function TestCard({ testCase }) {
  const [panel, setPanel] = useState("dataLayer");
  const activeTest = testCase.tests?.[panel];
  const planFindings = (testCase.findings || []).filter(
    (finding) => !finding.code.startsWith("DL_")
  );

  return (
    <article className="test-card">
      <header className="test-header">
        <div className="test-identity">
          <span className="test-id">{testCase.id}</span>
          <div>
            <h3>{testCase.name}</h3>
            <p>
              {testCase.action}
              {testCase.interactionType
                ? ` · ${testCase.interactionType}`
                : ""}
            </p>
          </div>
        </div>
        <StatusBadge status={testCase.status} />
      </header>

      <div className="event-contract">
        <span>Expected event</span>
        <strong>{testCase.canonicalEvent || "Unresolved"}</strong>
        <span>{testCase.canonicalName || "Unknown event"}</span>
        {testCase.observedEvents?.length > 0 && (
          <>
            <span className="contract-arrow">→</span>
            <span>Observed</span>
            <strong>{testCase.observedEvents.join(", ")}</strong>
          </>
        )}
      </div>

      <div className="test-tabs" role="tablist" aria-label="Test evidence">
        {[
          ["dataLayer", "Data Layer"],
          ["debugger", "Adobe Debugger"],
        ].map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={panel === key}
            className={panel === key ? "active" : ""}
            onClick={() => setPanel(key)}
          >
            {label}
            <StatusBadge
              status={testCase.tests?.[key]?.result || "NOT_TESTABLE"}
            />
          </button>
        ))}
      </div>

      <div className="test-panel" role="tabpanel">
        {activeTest?.checks?.length ? (
          activeTest.checks.map((check) => (
            <CheckRow key={check.key} check={check} />
          ))
        ) : (
          <div className="empty-evidence">
            No comparable {panel === "dataLayer" ? "data layer push" : "Adobe beacon"} was captured.
          </div>
        )}
        {panel === "dataLayer" && <AuditGrid audit={activeTest?.audit} />}
      </div>

      {(planFindings.length > 0 || testCase.reason) && (
        <details className="findings">
          <summary>
            Findings and context
            <ChevronDown size={16} />
          </summary>
          {testCase.reason && <p>{testCase.reason}</p>}
          {planFindings.map((finding) => (
            <p key={`${finding.code}-${finding.message}`}>
              <strong>{finding.code}</strong> — {finding.message}
            </p>
          ))}
        </details>
      )}
    </article>
  );
}

function Results({ report }) {
  const [filter, setFilter] = useState("ALL");
  const [query, setQuery] = useState("");
  const buckets = report.summary?.buckets || {};
  const cases = useMemo(
    () =>
      (report.cases || []).filter((testCase) => {
        const matchesStatus = filter === "ALL" || testCase.status === filter;
        const haystack = [
          testCase.id,
          testCase.name,
          testCase.canonicalEvent,
          testCase.canonicalName,
          ...(testCase.observedEvents || []),
          ...(testCase.checks || []).map((check) => check.key),
        ]
          .join(" ")
          .toLowerCase();
        return matchesStatus && haystack.includes(query.toLowerCase());
      }),
    [filter, query, report.cases]
  );

  function downloadReport() {
    const blob = new Blob([JSON.stringify(report, null, 2)], {
      type: "application/json",
    });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = `adobe-qa-${report.ranAt.replaceAll(":", "-")}.json`;
    anchor.click();
    URL.revokeObjectURL(href);
  }

  return (
    <section className="results">
      <div className="results-heading">
        <div>
          <p className="eyebrow">Latest run</p>
          <h2>{report.plan}</h2>
          <p>{report.summary.total} implementation tests</p>
        </div>
        <button className="secondary-button" type="button" onClick={downloadReport}>
          <Download size={17} />
          Export JSON
        </button>
      </div>

      <div className="summary-grid">
        {Object.entries(STATUS_META).map(([status, meta]) => {
          const Icon = meta.icon;
          return (
            <button
              type="button"
              className={`summary-card summary-${status.toLowerCase()} ${filter === status ? "selected" : ""}`}
              key={status}
              onClick={() => setFilter(filter === status ? "ALL" : status)}
            >
              <Icon size={20} />
              <strong>{buckets[status] || 0}</strong>
              <span>{meta.label}</span>
            </button>
          );
        })}
      </div>

      {report.pageFindings?.length > 0 && (
        <div className="page-findings">
          <AlertCircle size={20} />
          <div>
            <strong>Page-level plan corrections</strong>
            {report.pageFindings.map((finding) => (
              <p key={finding.key}>
                {finding.key}: plan expects {JSON.stringify(finding.expected)}, page sends{" "}
                {JSON.stringify(finding.actual)}
              </p>
            ))}
          </div>
        </div>
      )}

      <div className="result-tools">
        <div className="search">
          <Search size={17} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search event, variable, or component"
            aria-label="Search results"
          />
        </div>
        <button
          type="button"
          className={filter === "ALL" ? "filter active" : "filter"}
          onClick={() => setFilter("ALL")}
        >
          All tests
        </button>
        <button
          type="button"
          className={filter === "FAIL" ? "filter active" : "filter"}
          onClick={() => setFilter("FAIL")}
        >
          Errors to fix
        </button>
      </div>

      <div className="test-list">
        {cases.length ? (
          cases.map((testCase) => (
            <TestCard key={testCase.id} testCase={testCase} />
          ))
        ) : (
          <div className="no-results">No tests match the current filters.</div>
        )}
      </div>
    </section>
  );
}

export default function Home() {
  const [sourceType, setSourceType] = useState("pptx");
  const [report, setReport] = useState(null);
  const [error, setError] = useState("");
  const [running, setRunning] = useState(false);

  async function runQa(event) {
    event.preventDefault();
    setRunning(true);
    setError("");
    try {
      const response = await fetch("/api/qa", {
        method: "POST",
        body: new FormData(event.currentTarget),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "The QA run failed");
      setReport(payload.report);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The QA run failed");
    } finally {
      setRunning(false);
    }
  }

  return (
    <main>
      <nav className="topbar">
        <div className="brand">
          <span className="brand-mark">
            <BarChart3 size={21} />
          </span>
          <span>Adobe QA</span>
          <span className="internal">Internal</span>
        </div>
        <span className="runner-status">
          <span />
          Runner ready
        </span>
      </nav>

      <div className="shell">
        <header className="hero">
          <p className="eyebrow">Implementation validation</p>
          <h1>Test the plan against the page.</h1>
          <p>
            Upload a measurement plan, run every supported interaction, and get
            a focused list of events, variables, and implementation defects.
          </p>
        </header>

        <div className={`workspace ${report ? "has-report" : ""}`}>
          <aside className="run-card">
            <div className="card-title">
              <span><FlaskConical size={19} /></span>
              <div>
                <h2>New QA run</h2>
                <p>Plan + target environment</p>
              </div>
            </div>

            <form onSubmit={runQa}>
              <label>
                Target URL
                <input
                  type="url"
                  name="url"
                  placeholder="https://sustainability.aboutamazon.com/..."
                  required
                />
              </label>

              <label>
                Measurement plan source
                <select
                  name="sourceType"
                  value={sourceType}
                  onChange={(event) => setSourceType(event.target.value)}
                >
                  <option value="pptx">PowerPoint (.pptx)</option>
                  <option value="sheet">Google Sheet URL</option>
                  <option value="sheet-csv">Events + Pushes CSVs</option>
                  <option value="json">Executable JSON</option>
                  <option value="csv">Single CSV</option>
                </select>
              </label>

              {["pptx", "json", "csv"].includes(sourceType) && (
                <label className="upload-zone">
                  <Upload size={22} />
                  <strong>Choose measurement plan</strong>
                  <span>
                    {sourceType === "pptx"
                      ? "PPTX implementation guide"
                      : sourceType.toUpperCase()}
                  </span>
                  <input
                    type="file"
                    name="plan"
                    accept={`.${sourceType}`}
                    required
                  />
                </label>
              )}

              {sourceType === "sheet" && (
                <label>
                  Google Sheet URL
                  <input
                    type="url"
                    name="sheetUrl"
                    placeholder="https://docs.google.com/spreadsheets/d/..."
                    required
                  />
                </label>
              )}

              {sourceType === "sheet-csv" && (
                <div className="split-files">
                  <label>
                    Events CSV
                    <input type="file" name="eventsCsv" accept=".csv" required />
                  </label>
                  <label>
                    Pushes CSV
                    <input type="file" name="pushesCsv" accept=".csv" required />
                  </label>
                </div>
              )}

              <label>
                Report suite
                <input
                  name="reportSuite"
                  defaultValue="amznsproduction"
                  required
                />
              </label>

              {error && (
                <div className="form-error" role="alert">
                  <AlertCircle size={17} />
                  {error}
                </div>
              )}

              <button className="run-button" type="submit" disabled={running}>
                {running ? (
                  <>
                    <LoaderCircle className="spin" size={18} />
                    Running browser tests…
                  </>
                ) : (
                  <>
                    <Play size={18} fill="currentColor" />
                    Run QA
                  </>
                )}
              </button>
              <p className="run-note">
                A fresh browser session is used for each test case.
              </p>
            </form>
          </aside>

          {report ? (
            <Results report={report} />
          ) : (
            <section className="empty-state">
              <div className="empty-icon">
                <FileSpreadsheet size={28} />
              </div>
              <h2>Your QA report will appear here</h2>
              <p>
                Results are grouped by implementation verdict with independent
                Data Layer and Adobe Debugger evidence.
              </p>
              <div className="empty-preview">
                <span />
                <span />
                <span />
              </div>
            </section>
          )}
        </div>
      </div>
    </main>
  );
}
