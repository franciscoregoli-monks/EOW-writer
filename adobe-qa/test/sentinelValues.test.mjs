import assert from "node:assert/strict";
import test from "node:test";
import { evaluateEvars, isSentinelValue } from "../src/valueSemantics.mjs";
import { rollUpPageLevelFindings } from "../src/evaluateCase.mjs";

test("placeholder values are recognised regardless of casing or spacing", () => {
  for (const value of ["N/A", " n/a ", "NA", "undefined", "null", "-", "none"]) {
    assert.equal(isSentinelValue(value), true, `${value} should be a placeholder`);
  }
  for (const value of ["Highlight Slider", "0", "Energy Stories"]) {
    assert.equal(isSentinelValue(value), false, `${value} should be real data`);
  }
});

test("a dynamic field is not satisfied by a placeholder", () => {
  const checks = evaluateEvars(
    { eVar17: "<Link title>", eVar14: "<Destination URL>" },
    { eVar17: "N/A", eVar14: "https://example.com" }
  );
  const linkTitle = checks.find((check) => check.key === "eVar17");
  const destination = checks.find((check) => check.key === "eVar14");

  assert.equal(linkTitle.pass, false, "N/A must not satisfy a dynamic field");
  assert.match(linkTitle.note, /Placeholder value/);
  assert.equal(destination.pass, true);
});

test("a placeholder repeated on every component is not excused as a page defect", () => {
  const sentinelCheck = () => ({
    key: "eVar28",
    kind: "fixed",
    expected: "Highlight Slider",
    actual: "N/A",
    pass: false,
  });
  const { evaluations, pageFindings } = rollUpPageLevelFindings([
    { id: "a", status: "FAIL", qaResult: "FAIL", findings: [], checks: [sentinelCheck()] },
    { id: "b", status: "FAIL", qaResult: "FAIL", findings: [], checks: [sentinelCheck()] },
  ]);

  assert.deepEqual(pageFindings, []);
  for (const item of evaluations) {
    assert.equal(item.checks[0].pass, false);
    assert.equal(item.qaResult, "FAIL");
  }
});
