import assert from "node:assert/strict";
import test from "node:test";
import { evaluateEvars, parseFieldValue } from "../src/valueSemantics.mjs";

test("parses the four measurement-plan value kinds", () => {
  assert.deepEqual(parseFieldValue('"AI Insights"'), {
    kind: "fixed",
    value: "AI Insights",
    raw: '"AI Insights"',
  });
  assert.deepEqual(parseFieldValue('"A", "B", "C"'), {
    kind: "options",
    values: ["A", "B", "C"],
    raw: '"A", "B", "C"',
  });
  assert.equal(parseFieldValue("<Page URL>").kind, "dynamic");
  assert.equal(parseFieldValue("eVar12 (CTA Button) removed").kind, "removed");
});

test("dynamic values check presence; removed values do not score", () => {
  const checks = evaluateEvars(
    {
      eVar1: "<website domain>",
      eVar2: "<previous page>",
      eVar3: '"A", "B"',
      eVar4: '"Exact"',
      eVar12: "eVar12 (CTA Button) removed",
    },
    { eVar1: "example.com", eVar3: "B", eVar4: "Wrong" }
  );

  assert.equal(checks.length, 4);
  assert.equal(checks.find((check) => check.key === "eVar1").pass, true);
  assert.equal(checks.find((check) => check.key === "eVar2").pass, false);
  assert.equal(checks.find((check) => check.key === "eVar3").pass, true);
  assert.equal(checks.find((check) => check.key === "eVar4").pass, false);
});
