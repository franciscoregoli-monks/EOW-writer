import { isSentinelValue, parseFieldValue } from "./valueSemantics.mjs";

// Variables whose SDR definition describes where an interaction happened, not
// which component was interacted with. A plan that puts the component label in
// one of these is misusing the variable, and the implementation is right to
// send the real section.
const SECTION_ROLE = /\bsection\b/i;
const COMPONENT_ROLE = /\bcomponent\b/i;

function tokens(value) {
  return String(value || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map((token) => token.replace(/s$/, ""))
    .filter((token) => token.length > 1);
}

function sameSubject(a, b) {
  const left = new Set(tokens(a));
  const right = new Set(tokens(b));
  if (!left.size || !right.size) return false;
  const shared = [...left].filter((token) => right.has(token)).length;
  return shared === left.size || shared === right.size;
}

function roleOf(key, dictionary) {
  const name = dictionary?.eVars?.[key]?.canonicalName || "";
  if (COMPONENT_ROLE.test(name)) return "component";
  if (SECTION_ROLE.test(name)) return "section";
  return null;
}

// Returns the checks a plan got structurally wrong, so they can be reported as
// plan defects rather than counted as implementation failures.
export function detectVariableRoleDefects(testCase, checks, dictionary) {
  const componentSubject =
    testCase.target?.component || testCase.feature || testCase.name || "";
  const findings = [];
  const planLevelKeys = new Set();

  for (const check of checks) {
    if (check.pass || planLevelKeys.has(check.key)) continue;
    if (roleOf(check.key, dictionary) !== "section") continue;
    // A missing value is an implementation defect regardless of the plan.
    if (isSentinelValue(check.actual) || check.actual == null) continue;

    const expected = parseFieldValue(check.expected);
    const expectedValue =
      expected.kind === "fixed" ? expected.value : expected.raw;
    const looksLikeComponent =
      sameSubject(expectedValue, componentSubject) ||
      sameSubject(expectedValue, testCase.feature);
    if (!looksLikeComponent) continue;

    planLevelKeys.add(check.key);
    findings.push({
      code: "PLAN_VARIABLE_ROLE_MISMATCH",
      key: check.key,
      message:
        `Plan asks ${check.key} (${dictionary.eVars[check.key].canonicalName}) ` +
        `for ${JSON.stringify(expectedValue)}, which names the component. ` +
        `The page sends ${JSON.stringify(check.actual)}; the component name ` +
        "belongs in the Component variable.",
    });
  }

  return { findings, planLevelKeys };
}
