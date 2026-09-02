import {
  eventFamily,
  isPlanDefect,
  normalizeEventName,
  resolveCanonicalEvent,
} from "./canonicalEvent.mjs";
import { checkDataLayerPush } from "./dataLayerCheck.mjs";
import {
  evaluateEvars,
  isSentinelValue,
  planEvars,
} from "./valueSemantics.mjs";
import { detectVariableRoleDefects } from "./variableRoles.mjs";

const WEB_VITALS_EVENTS = new Set([
  "event85",
  "event86",
  "event87",
  "event88",
  "event89",
]);

function eventIdsInBeacon(beacon) {
  return String(beacon?.events || "")
    .split(",")
    .map((value) => value.trim().split("=")[0])
    .filter((value) => /^event\d+$/.test(value));
}

function dataLayerEventId(name, sdr, reportSuite) {
  const wanted = normalizeEventName(name);
  for (const [alias, eventId] of Object.entries(sdr.aliases || {})) {
    if (normalizeEventName(alias) === wanted) return eventId;
  }
  const events =
    sdr.byReportSuite?.[reportSuite]?.dictionary?.events || {};
  for (const event of Object.values(events)) {
    if (
      normalizeEventName(event.canonicalName) === wanted ||
      normalizeEventName(event.friendlyName) === wanted
    ) {
      return event.id;
    }
  }
  return null;
}

export function preparePlan(plan, sdr, reportSuite) {
  return {
    ...plan,
    adobe: { ...(plan.adobe || {}), reportSuite },
    cases: plan.cases.map((testCase) => {
      const canonical = resolveCanonicalEvent(testCase, sdr, reportSuite);
      const unsupported = ["video", "scroll"].includes(canonical.family);
      return {
        ...testCase,
        canonical,
        execution: unsupported
          ? {
              skip: true,
              reason: `Multi-step ${canonical.family} sequences are not supported in this MVP`,
            }
          : { skip: false },
      };
    }),
  };
}

export function evaluateCanonicalCase(
  testCase,
  capture,
  sdr,
  reportSuite,
  dataLayerMap = null
) {
  // An HTML link may be an editorial CTA. For single-click cases, the plan
  // decides CTA vs Link Click; DOM tag and destination only locate the target.
  const canonical =
    testCase.canonical ||
    resolveCanonicalEvent(testCase, sdr, reportSuite);
  const parserFindings = (testCase.source?.parserWarnings || []).map(
    (warning) => ({
      code: warning.code,
      message: warning.message,
    })
  );
  const planDefect = isPlanDefect(canonical) || parserFindings.length > 0;
  const findings = [...canonical.findings, ...parserFindings];

  if (["video", "scroll"].includes(eventFamily(canonical.eventId))) {
    return {
      status: "NOT_TESTABLE",
      qaResult: null,
      canonical,
      findings,
      reason: `Multi-step ${canonical.family} sequences are not supported in this MVP`,
      checks: [],
      propsReference: testCase.expected?.props || {},
    };
  }

  if (capture?.error) {
    const unresolved = capture.error.code === "TARGET_NOT_FOUND";
    return {
      status: unresolved ? "NOT_TESTABLE" : "FAIL",
      qaResult: unresolved ? null : "FAIL",
      canonical,
      findings: unresolved
        ? [
            ...findings,
            {
              code: "TARGET_NOT_RESOLVED",
              message: `No element matched this component on ${testCase.url}`,
            },
          ]
        : findings,
      reason: unresolved
        ? "Target not resolved — nothing was measured"
        : capture.error.message,
      checks: [],
      propsReference: testCase.expected?.props || {},
    };
  }

  const dataLayerEvent =
    capture.dataLayerEvents.find(
      (event) =>
        dataLayerEventId(event?.event, sdr, reportSuite) === canonical.eventId
    ) || null;
  const beacon =
    capture.beacons.find((item) =>
      eventIdsInBeacon(item).includes(canonical.eventId)
    ) || null;
  // Launch also emits web-vitals housekeeping hits. When the expected event is
  // absent, report the real interaction hit instead of a wall of nulls.
  const interactionBeacon =
    beacon ||
    capture.beacons.find((item) =>
      eventIdsInBeacon(item).some((id) => !WEB_VITALS_EVENTS.has(id))
    ) ||
    null;
  const allBeaconEvents = [
    ...new Set(capture.beacons.flatMap(eventIdsInBeacon)),
  ];
  const observedEvents = allBeaconEvents.filter(
    (id) => !WEB_VITALS_EVENTS.has(id)
  );
  const reservedEvents = allBeaconEvents.filter((id) =>
    WEB_VITALS_EVENTS.has(id)
  );
  const undocumentedEvents = allBeaconEvents.filter(
    (id) =>
      !WEB_VITALS_EVENTS.has(id) &&
      !sdr.byReportSuite?.[reportSuite]?.dictionary?.events?.[id]
  );

  // Clicking successfully but capturing nothing means the interaction was never
  // measured, so it cannot be judged as an implementation failure.
  if (!capture.dataLayerEvents.length && !observedEvents.length) {
    return {
      status: "NOT_TESTABLE",
      qaResult: null,
      canonical,
      findings: [
        ...findings,
        {
          code: "NO_TRACKING_FIRED",
          message:
            "Element was clicked but produced no data layer push and no Adobe interaction hit",
        },
      ],
      reason: "Nothing was captured — cannot verify this component",
      checks: [],
      observedEvents,
      reservedEvents,
      undocumentedEvents,
      propsReference: testCase.expected?.props || {},
    };
  }

  const checks = [
    {
      key: "dataLayer.event",
      kind: "event",
      expected: canonical.event?.canonicalName || canonical.eventId,
      actual:
        dataLayerEvent?.event ||
        capture.dataLayerEvents[0]?.event ||
        null,
      pass: Boolean(dataLayerEvent),
    },
    {
      key: "beacon.events",
      kind: "event",
      expected: canonical.eventId,
      actual: interactionBeacon?.events || null,
      pass: Boolean(beacon),
    },
    ...evaluateEvars(planEvars(testCase), interactionBeacon || {}),
  ];

  const dictionary = sdr.byReportSuite?.[reportSuite]?.dictionary;
  const roleDefects = detectVariableRoleDefects(testCase, checks, dictionary);
  const scoredChecks = checks.map((check) =>
    roleDefects.planLevelKeys.has(check.key)
      ? { ...check, pass: true, planLevel: true }
      : check
  );

  const dataLayerAudit = dataLayerMap
    ? checkDataLayerPush({
        rawPushCode: testCase.source?.rawPushCode,
        dataLayerEvent,
        map: dataLayerMap,
        dictionary,
      })
    : null;

  const allFindings = [
    ...findings,
    ...roleDefects.findings,
    ...(dataLayerAudit?.findings || []),
  ];
  const qaResult = scoredChecks.every((check) => check.pass) ? "PASS" : "FAIL";

  return {
    // A measured implementation failure takes precedence. Plan findings remain
    // attached, but may not hide a real bug such as event2 firing for a planned
    // event1 CTA.
    status:
      qaResult === "FAIL"
        ? "FAIL"
        : planDefect || roleDefects.findings.length
          ? "PLAN_FAIL"
          : "PASS",
    qaResult,
    canonical,
    findings: allFindings,
    dataLayerAudit,
    reason: null,
    dataLayerEvent,
    beacon: interactionBeacon,
    observedEvents,
    reservedEvents,
    undocumentedEvents,
    checks: scoredChecks,
    propsReference: testCase.expected?.props || {},
  };
}

// A fixed value that is identical across every measured case, and wrong in the
// same way every time, describes the page rather than any single component.
// Detected from the run itself so per-component values such as eVar28 are
// never swept up.
export function rollUpPageLevelFindings(evaluations) {
  const measured = evaluations.filter((item) => item.checks.length);
  if (measured.length < 2) return { evaluations, pageFindings: [] };

  const byKey = new Map();
  for (const evaluation of measured) {
    for (const check of evaluation.checks) {
      if (check.kind !== "fixed") continue;
      if (!byKey.has(check.key)) byKey.set(check.key, []);
      byKey.get(check.key).push(check);
    }
  }

  const pageLevelKeys = new Set();
  const pageFindings = [];
  for (const [key, checks] of byKey) {
    if (checks.length !== measured.length) continue;
    if (checks.some((check) => check.pass)) continue;
    // A placeholder is missing data, not an outdated plan, so it keeps failing
    // the component instead of being absorbed into a page-level finding.
    if (checks.some((check) => isSentinelValue(check.actual))) continue;
    const expected = new Set(checks.map((check) => JSON.stringify(check.expected)));
    const actual = new Set(checks.map((check) => JSON.stringify(check.actual)));
    if (expected.size !== 1 || actual.size !== 1) continue;
    pageLevelKeys.add(key);
    pageFindings.push({
      code: "PLAN_PAGE_METADATA_MISMATCH",
      key,
      expected: checks[0].expected,
      actual: checks[0].actual,
      cases: checks.length,
      message:
        `${key} is identical on every measured component: plan expects ` +
        `${JSON.stringify(checks[0].expected)}, page sends ` +
        `${JSON.stringify(checks[0].actual)}`,
    });
  }

  if (!pageLevelKeys.size) return { evaluations, pageFindings: [] };

  return {
    pageFindings,
    evaluations: evaluations.map((evaluation) => {
      if (!evaluation.checks.length) return evaluation;
      const checks = evaluation.checks.map((check) =>
        pageLevelKeys.has(check.key)
          ? { ...check, pass: true, pageLevel: true }
          : check
      );
      const qaResult = checks.every((check) => check.pass) ? "PASS" : "FAIL";
      // The page-level defect is reported once for the run; a component keeps
      // its own verdict instead of inheriting it.
      return {
        ...evaluation,
        checks,
        qaResult,
        status:
          evaluation.status === "PLAN_FAIL" ? "PLAN_FAIL" : qaResult,
      };
    }),
  };
}
