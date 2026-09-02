import {
  eventFamily,
  isPlanDefect,
  normalizeEventName,
  resolveCanonicalEvent,
} from "./canonicalEvent.mjs";
import { evaluateEvars, planEvars } from "./valueSemantics.mjs";

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

export function evaluateCanonicalCase(testCase, capture, sdr, reportSuite) {
  const observedInteractionType = capture?.targetMatch?.observedInteractionType;
  const canonical = observedInteractionType
    ? resolveCanonicalEvent(
        { ...testCase, interactionType: observedInteractionType },
        sdr,
        reportSuite
      )
    : testCase.canonical ||
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
    return {
      status:
        capture.error.code === "TARGET_NOT_FOUND" ? "NOT_TESTABLE" : "FAIL",
      qaResult: capture.error.code === "TARGET_NOT_FOUND" ? null : "FAIL",
      canonical,
      findings,
      reason:
        capture.error.code === "TARGET_NOT_FOUND"
          ? `${capture.error.message} — component may not exist on this URL`
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
  const observedEvents = [
    ...new Set(capture.beacons.flatMap(eventIdsInBeacon)),
  ].filter((id) => !WEB_VITALS_EVENTS.has(id));

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
  const qaPass = checks.every((check) => check.pass);
  const qaResult = qaPass ? "PASS" : "FAIL";

  return {
    status: planDefect ? "PLAN_DEFECT" : qaResult,
    qaResult,
    canonical,
    findings,
    reason: null,
    dataLayerEvent,
    beacon: interactionBeacon,
    observedEvents,
    checks,
    propsReference: testCase.expected?.props || {},
  };
}
