import assert from "node:assert/strict";
import test from "node:test";
import { rollUpPageLevelFindings } from "../src/evaluateCase.mjs";

function evaluation(id, checks) {
  return {
    id,
    status: "FAIL",
    qaResult: "FAIL",
    canonical: { eventId: "event2" },
    findings: [],
    checks,
  };
}

test("identical page-level mismatches roll up once and stop failing components", () => {
  const pageCheck = (pass = false) => ({
    key: "eVar3",
    kind: "fixed",
    expected: "Energy Spotlight",
    actual: "Spotlight: Investing in a carbon-free energy future",
    pass,
  });

  const { evaluations, pageFindings } = rollUpPageLevelFindings([
    evaluation("a", [
      pageCheck(),
      { key: "eVar28", kind: "fixed", expected: "Card A", actual: "optimize", pass: false },
    ]),
    evaluation("b", [
      pageCheck(),
      { key: "eVar28", kind: "fixed", expected: "Card B", actual: "approach", pass: false },
    ]),
  ]);

  assert.equal(pageFindings.length, 1);
  assert.equal(pageFindings[0].code, "PLAN_PAGE_METADATA_MISMATCH");
  assert.equal(pageFindings[0].key, "eVar3");
  assert.equal(pageFindings[0].cases, 2);

  for (const item of evaluations) {
    const eVar3 = item.checks.find((check) => check.key === "eVar3");
    const eVar28 = item.checks.find((check) => check.key === "eVar28");
    assert.equal(eVar3.pageLevel, true, "page-level value stops scoring");
    assert.equal(eVar3.pass, true);
    assert.equal(eVar28.pass, false, "per-component value still fails");
    assert.equal(item.qaResult, "FAIL");
  }
});

test("a component-specific mismatch is never rolled up", () => {
  const { pageFindings } = rollUpPageLevelFindings([
    evaluation("a", [
      { key: "eVar28", kind: "fixed", expected: "Card A", actual: "optimize", pass: false },
    ]),
    evaluation("b", [
      { key: "eVar28", kind: "fixed", expected: "Card B", actual: "approach", pass: false },
    ]),
  ]);
  assert.deepEqual(pageFindings, []);
});

test("components pass once only page-level values disagreed", () => {
  const shared = {
    key: "eVar4",
    kind: "fixed",
    expected: "Energy Stories",
    actual: "Spotlight On Energy",
    pass: false,
  };
  const { evaluations, pageFindings } = rollUpPageLevelFindings([
    evaluation("a", [{ ...shared }]),
    evaluation("b", [{ ...shared }]),
  ]);
  assert.equal(pageFindings.length, 1);
  for (const item of evaluations) {
    assert.equal(item.qaResult, "PASS");
    assert.equal(item.status, "PASS");
  }
});

test("known page variables remain page defects with one measured component", () => {
  const { evaluations, pageFindings } = rollUpPageLevelFindings([
    evaluation("only-measured-case", [
      {
        key: "eVar3",
        kind: "fixed",
        expected: "Energy Spotlight",
        actual: "Actual page title",
        pass: false,
      },
      {
        key: "eVar28",
        kind: "fixed",
        expected: "Card",
        actual: "section",
        pass: false,
      },
    ]),
  ]);

  assert.deepEqual(pageFindings.map((finding) => finding.key), ["eVar3"]);
  assert.equal(
    evaluations[0].checks.find((check) => check.key === "eVar3").pageLevel,
    true
  );
  assert.equal(
    evaluations[0].checks.find((check) => check.key === "eVar28").pass,
    false
  );
});
