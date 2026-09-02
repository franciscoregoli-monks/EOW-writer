import { readFile } from "node:fs/promises";
import path from "node:path";
import { parse } from "csv-parse/sync";
import { parseFieldValue } from "./valueSemantics.mjs";

const EVENTS_HEADERS = [
  "Order",
  "Section",
  "Feature",
  "Event Friendly Name",
  "Event Code",
  "Field Type",
  "Field Key",
  "Field Name",
  "Value",
];
const PUSHES_HEADERS = ["Order", "Push Code"];

function parseCsv(content, requiredHeaders, label) {
  const records = parse(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    bom: true,
    relax_column_count: true,
  });
  const headers = records.length ? Object.keys(records[0]) : [];
  const missing = requiredHeaders.filter((header) => !headers.includes(header));
  if (missing.length) {
    throw new Error(`${label}: missing columns: ${missing.join(", ")}`);
  }
  return records;
}

function canonicalFieldKey(fieldType, fieldKey) {
  const number = String(fieldKey || "").match(/\d+/)?.[0];
  if (!number) return String(fieldKey || "").trim();
  return /prop/i.test(fieldType) ? `prop${Number(number)}` : `eVar${Number(number)}`;
}

function interactionType(eventName) {
  const name = String(eventName || "").toLowerCase();
  if (name.includes("video")) return "video";
  if (name.includes("scroll")) return "scroll";
  if (name.includes("link")) return "link";
  if (name.includes("cta")) return "cta";
  return "custom";
}

function pushMetadata(pushCode) {
  const component = pushCode.match(
    /component\s*:\s*["“”']([^"“”']+)["“”']/i
  )?.[1];
  const event = pushCode.match(
    /event\s*:\s*["“”']([^"“”']+)["“”']/i
  )?.[1];
  const candidateSelectors = component
    ? [
        `[data-component="${component}"]`,
        `[data-analytics-component="${component}"]`,
        `#${component}`,
        `[data-testid="${component}"]`,
      ]
    : [];
  return {
    component: component || null,
    event: event || null,
    candidateSelectors,
  };
}

function addGroupWarning(group, code, message) {
  if (!group.parserWarnings.some((warning) => warning.code === code)) {
    group.parserWarnings.push({ code, message });
  }
}

export function parseSheetCsv({ eventsCsv, pushesCsv, url, name = "Google Sheet plan" }) {
  const eventRows = parseCsv(eventsCsv, EVENTS_HEADERS, "Events CSV");
  const pushRows = parseCsv(pushesCsv, PUSHES_HEADERS, "Pushes CSV");
  const groups = new Map();
  let eventRowsWithoutOrder = 0;

  for (const row of eventRows) {
    const order = String(row.Order || "").trim();
    if (!order) {
      eventRowsWithoutOrder += 1;
      continue;
    }
    if (!groups.has(order)) {
      groups.set(order, {
        order,
        section: row.Section || null,
        feature: row.Feature || null,
        eventFriendlyName: row["Event Friendly Name"] || null,
        expectedEvent: row["Event Code"] || null,
        eVars: {},
        props: {},
        removedFields: [],
        parserWarnings: [],
      });
    }
    const group = groups.get(order);
    for (const [field, candidate] of [
      ["section", row.Section],
      ["feature", row.Feature],
      ["eventFriendlyName", row["Event Friendly Name"]],
      ["expectedEvent", row["Event Code"]],
    ]) {
      if (candidate && group[field] && candidate !== group[field]) {
        addGroupWarning(
          group,
          `INCONSISTENT_${field.toUpperCase()}`,
          `Order ${order} contains both "${group[field]}" and "${candidate}" for ${field}`
        );
      }
    }

    const fieldType = row["Field Type"] || "";
    const key = canonicalFieldKey(fieldType, row["Field Key"]);
    const rawValue = String(row.Value || "").trim();
    if (!key || !rawValue) continue;
    const parsed = parseFieldValue(rawValue);
    const destination = /prop/i.test(fieldType) ? group.props : group.eVars;
    destination[key] = {
      ...parsed,
      friendlyName: row["Field Name"] || "",
    };
    if (parsed.kind === "removed") group.removedFields.push(key);
  }

  const pushes = new Map();
  const duplicatePushOrders = [];
  let pushRowsWithoutOrder = 0;
  for (const row of pushRows) {
    const order = String(row.Order || "").trim();
    if (!order) {
      pushRowsWithoutOrder += 1;
      continue;
    }
    if (pushes.has(order)) {
      duplicatePushOrders.push(order);
      continue;
    }
    const rawPushCode = row["Push Code"] || "";
    pushes.set(order, {
      rawPushCode,
      ...pushMetadata(rawPushCode),
    });
  }

  const unmatchedOrders = [];
  const cases = [...groups.values()].map((group) => {
    const push = pushes.get(group.order);
    if (!push) {
      unmatchedOrders.push(group.order);
      addGroupWarning(
        group,
        "UNMATCHED_PUSH_ORDER",
        `Order ${group.order} exists in Events but not in Pushes`
      );
    }
    if (duplicatePushOrders.includes(group.order)) {
      addGroupWarning(
        group,
        "DUPLICATE_PUSH_ORDER",
        `Order ${group.order} appears more than once in Pushes`
      );
    }
    if (
      push?.event &&
      group.eventFriendlyName &&
      push.event !== group.eventFriendlyName
    ) {
      addGroupWarning(
        group,
        "PUSH_EVENT_MISMATCH",
        `Events tab says "${group.eventFriendlyName}", Pushes tab says "${push.event}"`
      );
    }
    return {
      id: `order-${group.order}`,
      order: group.order,
      name: group.feature || `Order ${group.order}`,
      section: group.section,
      feature: group.feature,
      url,
      action: "click",
      interactionType: interactionType(group.eventFriendlyName),
      planEvent: {
        id: group.expectedEvent,
        name: group.eventFriendlyName,
      },
      expected: {
        eVars: group.eVars,
        props: group.props,
      },
      removedFields: group.removedFields,
      domHints: push?.candidateSelectors || [],
      target: {
        component: push?.component || null,
        pageSection: group.section,
        label: group.feature,
      },
      source: {
        order: group.order,
        pushMatched: Boolean(push),
        pushEvent: push?.event || null,
        rawPushCode: push?.rawPushCode || null,
        parserWarnings: group.parserWarnings,
      },
    };
  });

  return {
    name,
    adobe: { dataLayer: "adobeDataLayer" },
    cases,
    stats: {
      totalItems: cases.length,
      matched: cases.length - unmatchedOrders.length,
      unmatched: unmatchedOrders.length,
      unmatchedOrders,
      duplicatePushOrders,
      eventRowsWithoutOrder,
      pushRowsWithoutOrder,
    },
  };
}

export async function loadSheetPlan({
  eventsCsvPath,
  pushesCsvPath,
  sheetUrl,
  url,
}) {
  if (!url) throw new Error("--url is required for a Sheet plan");
  if (eventsCsvPath && pushesCsvPath) {
    const [eventsCsv, pushesCsv] = await Promise.all([
      readFile(eventsCsvPath, "utf8"),
      readFile(pushesCsvPath, "utf8"),
    ]);
    return parseSheetCsv({
      eventsCsv,
      pushesCsv,
      url,
      name: path.basename(eventsCsvPath),
    });
  }
  if (!sheetUrl) {
    throw new Error(
      "Provide --sheet URL or both --events-csv and --pushes-csv"
    );
  }
  const sheetId = sheetUrl.match(/\/spreadsheets\/d\/([^/]+)/)?.[1];
  if (!sheetId) throw new Error(`Invalid Google Sheet URL: ${sheetUrl}`);
  const exportTab = async (tab) => {
    const exportUrl =
      `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?` +
      `tqx=out:csv&sheet=${encodeURIComponent(tab)}`;
    const response = await fetch(exportUrl);
    if (!response.ok) {
      throw new Error(
        `Google Sheet ${tab} export returned ${response.status}. ` +
          "Grant link access or export Events and Pushes as CSV."
      );
    }
    return response.text();
  };
  const [eventsCsv, pushesCsv] = await Promise.all([
    exportTab("Events"),
    exportTab("Pushes"),
  ]);
  return parseSheetCsv({
    eventsCsv,
    pushesCsv,
    url,
    name: `Google Sheet ${sheetId}`,
  });
}
