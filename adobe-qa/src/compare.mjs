function getPath(obj, path) {
  if (obj == null) return undefined;
  if (Object.prototype.hasOwnProperty.call(obj, path) && path.indexOf(".") === -1) {
    return obj[path];
  }
  return path.split(".").reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
}

function normalize(value) {
  if (value == null) return value;
  if (typeof value === "string") return value.trim();
  return value;
}

export function matchEvent(actualEvents, expected) {
  if (!expected) return actualEvents[0] ?? null;
  const eventName = expected.event;
  if (!eventName) return actualEvents[0] ?? null;
  return (
    actualEvents.find((item) => item?.event === eventName) ??
    actualEvents.find((item) => getPath(item, "event") === eventName) ??
    null
  );
}

export function compareObject(expected, actual, prefix = "") {
  const checks = [];
  if (expected == null) return checks;

  for (const [key, expectedValue] of Object.entries(expected)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (
      expectedValue &&
      typeof expectedValue === "object" &&
      !Array.isArray(expectedValue)
    ) {
      checks.push(...compareObject(expectedValue, getPath(actual, key), path));
      continue;
    }
    const actualValue = getPath(actual, key);
    const pass = String(normalize(actualValue)) === String(normalize(expectedValue));
    checks.push({
      path,
      expected: expectedValue,
      actual: actualValue === undefined ? null : actualValue,
      pass,
    });
  }
  return checks;
}

export function compareCase({ expected, dataLayerEvents, beacons }) {
  const dlEvent = matchEvent(dataLayerEvents, expected.dataLayer);
  const beacon = beacons[0] ?? null;

  const dataLayerChecks = expected.dataLayer
    ? compareObject(expected.dataLayer, dlEvent ?? {})
    : [];
  const beaconChecks = expected.beacon
    ? compareObject(expected.beacon, beacon ?? {})
    : [];

  const warnings = [];
  if (expected.dataLayer && !dlEvent) {
    dataLayerChecks.unshift({
      path: "dataLayer.event",
      expected: expected.dataLayer.event ?? "(any event)",
      actual: null,
      pass: false,
      note: "No matching data layer event",
    });
  }
  if (expected.beacon && !beacon) {
    beaconChecks.unshift({
      path: "beacon",
      expected: "Adobe /b/ss/ hit",
      actual: null,
      pass: false,
      note: "Launch did not send an AppMeasurement beacon",
    });
  }
  if (beacons.length > 1) {
    warnings.push({
      path: "beacon.count",
      expected: 1,
      actual: beacons.length,
      pass: true,
      note: "Duplicate Adobe beacons on this action",
    });
  }
  if (beacon?.campaign === "%Tracking code%") {
    warnings.push({
      path: "beacon.campaign",
      expected: "(resolved tracking code)",
      actual: beacon.campaign,
      pass: true,
      note: "Placeholder tracking code was sent as eVar0",
    });
  }

  const checks = [...dataLayerChecks, ...beaconChecks, ...warnings];
  const required = [...dataLayerChecks, ...beaconChecks];
  const pass = required.length > 0 && required.every((check) => check.pass);
  return {
    pass,
    dataLayerEvent: dlEvent,
    beacon,
    beacons,
    checks,
  };
}
