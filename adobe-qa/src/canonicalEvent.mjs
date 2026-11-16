const VIDEO_IDS = new Set(["event13", "event14", "event15", "event16", "event17"]);
const SCROLL_IDS = new Set(["event5", "event6", "event7", "event8"]);

export function normalizeEventName(value) {
  return String(value || "")
    .replace(/\(e\d+\)/gi, "")
    .replace(/[^\p{L}\p{N}%]+/gu, " ")
    .trim()
    .toLowerCase();
}

function buildNameIndex(sdr, reportSuite) {
  const dictionary = sdr.byReportSuite[reportSuite]?.dictionary;
  if (!dictionary) return {};
  const index = {};
  for (const event of Object.values(dictionary.events)) {
    index[normalizeEventName(event.id)] = event.id;
    index[normalizeEventName(event.friendlyName)] = event.id;
    index[normalizeEventName(event.canonicalName)] = event.id;
  }
  for (const [alias, eventId] of Object.entries(sdr.aliases || {})) {
    index[normalizeEventName(alias)] = eventId;
  }
  return index;
}

function idFromName(name, index) {
  return index[normalizeEventName(name)] || null;
}

function interactionEventId(testCase) {
  const type = String(testCase.interactionType || "").toLowerCase();
  if (type === "link") return "event2";
  if (type === "cta" || type === "download") return "event1";
  if (type === "video") {
    const name = normalizeEventName(
      `${testCase.planEvent?.name || ""} ${testCase.milestone || ""}`
    );
    if (name.includes("complete")) return "event14";
    if (name.includes("25")) return "event15";
    if (name.includes("50")) return "event16";
    if (name.includes("75")) return "event17";
    return "event13";
  }
  if (type === "scroll") {
    const name = normalizeEventName(
      `${testCase.planEvent?.name || ""} ${testCase.milestone || ""}`
    );
    if (name.includes("100")) return "event8";
    if (name.includes("75")) return "event7";
    if (name.includes("50")) return "event6";
    return "event5";
  }
  return null;
}

export function eventFamily(eventId) {
  if (VIDEO_IDS.has(eventId)) return "video";
  if (SCROLL_IDS.has(eventId)) return "scroll";
  return "click";
}

export function resolveCanonicalEvent(testCase, sdr, reportSuite) {
  const suite = sdr.byReportSuite?.[reportSuite];
  if (!suite) {
    return {
      eventId: null,
      event: null,
      family: null,
      findings: [
        {
          code: "UNKNOWN_REPORT_SUITE",
          message: `${reportSuite} is not present in the WWS SDR`,
        },
      ],
    };
  }

  const index = buildNameIndex(sdr, reportSuite);
  const claimedId =
    testCase.planEvent?.id ||
    String(testCase.expected?.beacon?.events || "")
      .split(",")
      .find((item) => /^event\d+$/.test(item.trim()))
      ?.trim() ||
    null;
  const claimedName =
    testCase.planEvent?.name || testCase.expected?.dataLayer?.event || null;
  const nameId = idFromName(claimedName, index);
  const typeId = interactionEventId(testCase);
  const findings = [];

  if (claimedId && !suite.dictionary.events[claimedId]) {
    findings.push({
      code: "UNKNOWN_PLAN_EVENT",
      message: `${claimedId} is not defined in SDR ${reportSuite}`,
    });
  }
  if (claimedName && !nameId) {
    findings.push({
      code: "UNKNOWN_PLAN_EVENT_NAME",
      message: `Plan event name "${claimedName}" does not resolve in SDR ${reportSuite}`,
    });
  }
  if (claimedName && !claimedId) {
    findings.push({
      code: "MISSING_PLAN_EVENT_ID",
      message: `Plan names "${claimedName}" but does not provide an Adobe event ID`,
    });
  }
  if (claimedId && nameId && claimedId !== nameId) {
    findings.push({
      code: "PLAN_EVENT_ID_NAME_MISMATCH",
      message: `Plan pairs ${claimedName} with ${claimedId}; SDR maps that name to ${nameId}`,
    });
  }
  if (claimedId && typeId && claimedId !== typeId) {
    findings.push({
      code: "PLAN_INTERACTION_MISMATCH",
      message: `Plan claims ${claimedId}, but interaction type ${testCase.interactionType} maps to ${typeId}`,
    });
  }

  // Interaction type describes what the browser must do and wins when explicit.
  // Otherwise a canonical name wins over a possibly wrong numeric claim.
  const eventId = typeId || nameId || claimedId;
  const event = eventId ? suite.dictionary.events[eventId] || null : null;
  if (!eventId || !event) {
    findings.push({
      code: "UNRESOLVED_EVENT",
      message: `Could not resolve a canonical SDR event for ${testCase.id}`,
    });
  }

  return {
    eventId,
    event,
    family: eventId ? eventFamily(eventId) : null,
    claimedId,
    claimedName,
    findings,
  };
}

export function isPlanDefect(resolution) {
  return resolution.findings.some((finding) =>
    [
      "UNKNOWN_PLAN_EVENT",
      "UNKNOWN_PLAN_EVENT_NAME",
      "MISSING_PLAN_EVENT_ID",
      "PLAN_EVENT_ID_NAME_MISMATCH",
      "PLAN_INTERACTION_MISMATCH",
      "UNRESOLVED_EVENT",
    ].includes(finding.code)
  );
}
