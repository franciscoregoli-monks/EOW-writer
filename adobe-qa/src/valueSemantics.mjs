const REMOVED = /\bremoved\b/i;
const ANGLE_VALUE = /^\s*<[^>]+>\s*$/;
const QUOTED_VALUE = /["“”]([^"“”]+)["“”]/g;

export function parseFieldValue(input) {
  if (input && typeof input === "object" && input.kind) return input;
  const raw = input == null ? "" : String(input).trim();

  if (REMOVED.test(raw)) {
    return { kind: "removed", raw };
  }
  if (ANGLE_VALUE.test(raw)) {
    return { kind: "dynamic", raw };
  }

  const quoted = [...raw.matchAll(QUOTED_VALUE)].map((match) =>
    match[1].trim()
  );
  if (quoted.length > 1) {
    return { kind: "options", values: quoted, raw };
  }
  if (quoted.length === 1) {
    return { kind: "fixed", value: quoted[0], raw };
  }
  return { kind: "fixed", value: raw, raw };
}

export function evaluateField(key, expectedInput, actualInput) {
  const expected = parseFieldValue(expectedInput);
  const actual =
    actualInput == null ? "" : typeof actualInput === "string" ? actualInput.trim() : actualInput;

  if (expected.kind === "removed") {
    return {
      key,
      kind: expected.kind,
      expected: expected.raw,
      actual: null,
      pass: true,
      excluded: true,
    };
  }

  if (expected.kind === "dynamic") {
    return {
      key,
      kind: expected.kind,
      expected: expected.raw,
      actual: actual || null,
      pass: actual !== "",
    };
  }

  if (expected.kind === "options") {
    return {
      key,
      kind: expected.kind,
      expected: expected.values,
      actual: actual || null,
      pass: expected.values.includes(String(actual)),
    };
  }

  return {
    key,
    kind: expected.kind,
    expected: expected.value,
    actual: actual || null,
    pass: String(actual) === expected.value,
  };
}

export function evaluateEvars(expectedEvars = {}, actualBeacon = {}) {
  return Object.entries(expectedEvars)
    .map(([key, expected]) => evaluateField(key, expected, actualBeacon[key]))
    .filter((check) => !check.excluded);
}

export function planEvars(testCase) {
  if (testCase.expected?.eVars) return testCase.expected.eVars;
  const beacon = testCase.expected?.beacon || {};
  return Object.fromEntries(
    Object.entries(beacon).filter(([key]) => /^eVar\d+$/.test(key))
  );
}
