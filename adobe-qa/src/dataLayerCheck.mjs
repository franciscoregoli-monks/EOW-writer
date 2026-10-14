import { isSentinelValue } from "./valueSemantics.mjs";

function canonicalKey(key, map) {
  const alias = map.aliases?.[key];
  return alias || key;
}

// The plan's push slide is the contract the frontend implements, so compare the
// push itself, not only what Launch forwarded to Adobe.
export function planPushKeys(rawPushCode) {
  if (!rawPushCode) return [];
  const body = rawPushCode.match(/userInteraction\s*:\s*\{([\s\S]*)/i)?.[1];
  if (!body) return [];
  return [...body.matchAll(/(^|[\s,{])([a-zA-Z][a-zA-Z0-9]*)\s*:/g)]
    .map((match) => match[2])
    .filter((key) => key !== "userInteraction");
}

export function checkDataLayerPush({
  rawPushCode,
  dataLayerEvent,
  map,
  dictionary,
}) {
  const expectedKeys = [
    ...new Set(planPushKeys(rawPushCode).map((key) => canonicalKey(key, map))),
  ];
  if (!expectedKeys.length) return null;

  const payload = dataLayerEvent?.userInteraction || {};
  const actualKeys = Object.keys(payload).map((key) => canonicalKey(key, map));
  const actualSet = new Set(actualKeys);

  const missing = expectedKeys.filter((key) => !actualSet.has(key));
  const undeclared = actualKeys.filter((key) => !expectedKeys.includes(key));
  const placeholders = actualKeys.filter((key) =>
    isSentinelValue(payload[key] ?? payload[Object.keys(payload).find((k) => canonicalKey(k, map) === key)])
  );
  const unmapped = expectedKeys.filter((key) => !map.map[key]);

  const describe = (key) => {
    const variable = map.map[key];
    const name = variable && dictionary?.eVars?.[variable]?.canonicalName;
    return name ? `${key} → ${variable} (${name})` : key;
  };

  return {
    expectedKeys,
    actualKeys,
    missing,
    undeclared,
    placeholders,
    unmapped,
    findings: [
      ...missing.map((key) => ({
        code: "DL_KEY_MISSING",
        message: `Plan push declares ${describe(key)} but the page did not send it`,
      })),
      ...undeclared.map((key) => ({
        code: "DL_KEY_UNDECLARED",
        message: `Page sends ${describe(key)}, which the plan push does not declare`,
      })),
      ...unmapped.map((key) => ({
        code: "DL_KEY_UNMAPPED",
        message: `Plan push declares ${key}, which has no known Adobe variable mapping`,
      })),
    ],
  };
}
