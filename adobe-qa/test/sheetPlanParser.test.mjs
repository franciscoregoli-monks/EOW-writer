import assert from "node:assert/strict";
import test from "node:test";
import { parseSheetCsv } from "../src/sheetPlanParser.mjs";

function csv(headers, rows) {
  const quote = (value) => {
    const string = String(value ?? "");
    return /[",\n]/.test(string) ? `"${string.replaceAll('"', '""')}"` : string;
  };
  return [
    headers.map(quote).join(","),
    ...rows.map((row) => headers.map((header) => quote(row[header])).join(",")),
  ].join("\n");
}

const eventHeaders = [
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

test("groups Events by exact Order and reuses shared value semantics", () => {
  const eventsCsv = `Instructions before the real header\n${csv(eventHeaders, [
    {
      Order: "1",
      Section: "Landing",
      Feature: "Download Report",
      "Event Friendly Name": "CTA Clicks",
      "Event Code": "event1",
      "Field Type": "eVar",
      "Field Key": "eVar3",
      "Field Name": "Page Name",
      Value: '"AI Insights"',
    },
    {
      Order: "1",
      Section: "Landing",
      Feature: "Download Report",
      "Event Friendly Name": "CTA Clicks",
      "Event Code": "event1",
      "Field Type": "eVar",
      "Field Key": "eVar12",
      "Field Name": "CTA Button",
      Value: "removed",
    },
    {
      Order: "1",
      Section: "Landing",
      Feature: "Download Report",
      "Event Friendly Name": "CTA Clicks",
      "Event Code": "event1",
      "Field Type": "Prop",
      "Field Key": "Prop1",
      "Field Name": "Timestamp",
      Value: "<Timestamp>",
    },
    {
      Order: "2",
      Section: "Response",
      Feature: "Response",
      "Event Friendly Name": "AI Query Response",
      "Event Code": "event31",
      "Field Type": "eVar",
      "Field Key": "eVar48",
      "Field Name": "AI Response Type",
      Value: "“Regular”, “Moderated”",
    },
    {
      Order: "01",
      Section: "Landing",
      Feature: "Exact order check",
      "Event Friendly Name": "CTA Clicks",
      "Event Code": "event1",
      "Field Type": "eVar",
      "Field Key": "eVar36",
      "Field Name": "Component",
      Value: "”prePromptButton”",
    },
  ])}`.replace("Order,Section", '"Instructions merged into Order",Section');
  const pushesCsv = `One component per row\n${csv(["Order", "Push Code"], [
    {
      Order: "1",
      "Push Code":
        'adobeDataLayer.push({ event: "CTA Clicks", component: "HomeCtaCard" });',
    },
    {
      Order: "2",
      "Push Code":
        'adobeDataLayer.push({ event: "AI Query Response", component: "messageResponse" });',
    },
  ])}`.replace("Order,Push Code", '"Instructions merged into Order",Push Code');

  const plan = parseSheetCsv({
    eventsCsv,
    pushesCsv,
    url: "https://example.com",
  });
  assert.deepEqual(plan.stats, {
    totalItems: 3,
    matched: 2,
    unmatched: 1,
    unmatchedOrders: ["01"],
    duplicatePushOrders: [],
    eventRowsWithoutOrder: 0,
    pushRowsWithoutOrder: 0,
  });

  const download = plan.cases.find((item) => item.order === "1");
  assert.equal(download.expected.eVars.eVar3.kind, "fixed");
  assert.equal(download.expected.eVars.eVar3.value, "AI Insights");
  assert.equal(download.expected.eVars.eVar12.kind, "removed");
  assert.equal(download.expected.props.prop1.kind, "dynamic");
  assert.equal(download.target.component, "HomeCtaCard");
  assert.deepEqual(download.domHints, [
    '[data-component="HomeCtaCard"]',
    '[data-analytics-component="HomeCtaCard"]',
    "#HomeCtaCard",
    '[data-testid="HomeCtaCard"]',
  ]);

  const response = plan.cases.find((item) => item.order === "2");
  assert.deepEqual(response.expected.eVars.eVar48.values, [
    "Regular",
    "Moderated",
  ]);
  assert.equal(response.interactionType, "custom");

  const exactOrder = plan.cases.find((item) => item.order === "01");
  assert.equal(exactOrder.expected.eVars.eVar36.value, "prePromptButton");
  assert.ok(
    exactOrder.source.parserWarnings.some(
      (warning) => warning.code === "UNMATCHED_PUSH_ORDER"
    )
  );
});

test("rejects a Sheet export with missing literal columns", () => {
  assert.throws(
    () =>
      parseSheetCsv({
        eventsCsv: "Order,Feature\n1,Download",
        pushesCsv: "Order,Push Code\n1,x",
        url: "https://example.com",
      }),
    /could not find a header row/
  );
});
