const REMOVED = /\bremoved\b/i;
const ANGLE_VALUE = /^\s*<[^>]+>\s*$/;
const QUOTED_VALUE = /["“”]([^"“”]+)["“”]/g;

// Values Adobe receives when the implementation had nothing to send. They are
// technically present, so a bare non-empty check would accept them, but they
// carry no analysable data and must be reported as failures.
const SENTINEL_VALUES = new Set([
  "n/a",
  "na",
  "n.a.",
  "not available",
  "not applicable",
  "undefined",
  "null",
  "none",
  "-",
  "--",
  "unspecified",
  "unknown",
  "%tracking code%",
]);

export function isSentinelValue(value) {
  if (value == null) return false;
  return SENTINEL_VALUES.has(String(value).trim().toLowerCase());
}

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

  const sentinel = isSentinelValue(actual);
  const note = sentinel
    ? `Placeholder value ${JSON.stringify(actual)} carries no data`
    : undefined;

  if (expected.kind === "dynamic") {
    return {
      key,
      kind: expected.kind,
      expected: expected.raw,
      actual: actual || null,
      pass: actual !== "" && !sentinel,
      ...(note ? { note } : {}),
    };
  }

  if (expected.kind === "options") {
    return {
      key,
      kind: expected.kind,
      expected: expected.values,
      actual: actual || null,
      pass: !sentinel && expected.values.includes(String(actual)),
      ...(note ? { note } : {}),
    };
  }

  return {
    key,
    kind: expected.kind,
    expected: expected.value,
    actual: actual || null,
    pass: !sentinel && String(actual) === expected.value,
    ...(note ? { note } : {}),
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
