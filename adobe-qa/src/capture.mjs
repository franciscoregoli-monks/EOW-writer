import puppeteer from "puppeteer-core";
import { decodeBeaconUrl, flattenBeacon, isAdobeBeacon } from "./decodeBeacon.mjs";
import {
  findProbeCandidates,
  resolveProbeCandidate,
  resolveTarget,
} from "./targetResolver.mjs";
import { parseFieldValue } from "./valueSemantics.mjs";

const DEFAULT_CHROME =
  process.env.CHROME_PATH ||
  "/usr/bin/google-chrome-stable";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

function getPath(obj, path) {
  return path.split(".").reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
}

async function dumpDataLayer(page, name) {
  return page.evaluate((layerName) => {
    const layer = window[layerName];
    if (!layer) return [];
    const clone = (value) => {
      try {
        return JSON.parse(JSON.stringify(value));
      } catch {
        return { unserializable: true };
      }
    };
    if (Array.isArray(layer)) return layer.map(clone);
    if (typeof layer.getState === "function") {
      return [clone(layer.getState())];
    }
    return [];
  }, name);
}

function fixedEVar12(testCase) {
  const expected = parseFieldValue(testCase.expected?.eVars?.eVar12);
  return expected.kind === "fixed" && expected.value
    ? expected.value
    : null;
}

async function installDataLayerObserver(page, layerName) {
  await page.evaluate((name) => {
    const layer = window[name];
    if (!Array.isArray(layer) || layer.__adobeQaWrapped) return;
    const originalPush = layer.push.bind(layer);
    Object.defineProperty(layer, "__adobeQaWrapped", {
      value: true,
      configurable: true,
    });
    layer.push = (...items) => {
      for (const item of items) {
        try {
          window.__adobeQaCapturePush(JSON.parse(JSON.stringify(item)));
        } catch {
          // The normal push must continue even if evidence cannot clone.
        }
      }
      return originalPush(...items);
    };
  }, layerName);
}

async function clickTarget(target) {
  await target.element.evaluate((element) =>
    element.scrollIntoView({ block: "center", inline: "center" })
  );
  await new Promise((resolve) => setTimeout(resolve, 300));
  try {
    await target.element.click();
  } catch {
    await target.element.evaluate((element) => element.click());
  }
  await target.element.dispose();
}

async function runAction(page, testCase) {
  const action = testCase.action || "page_load";
  if (action === "page_load") return null;
  if (action === "click") {
    const target = await resolveTarget(page, testCase);
    if (!target) {
      const error = new Error(`${testCase.id}: target not found`);
      error.code = "TARGET_NOT_FOUND";
      throw error;
    }
    await clickTarget(target);
    return target.match;
  }
  throw new Error(`${testCase.id}: unsupported action "${action}"`);
}

async function captureProbeCandidate(
  browser,
  testCase,
  candidateIndex,
  layerName,
  { timeoutMs, preActionSettleMs, settleMs }
) {
  const page = await browser.newPage();
  const beaconUrls = [];
  const liveDataLayerEvents = [];
  try {
    await page.setViewport({ width: 1440, height: 900 });
    await page.setUserAgent(USER_AGENT);
    await page.exposeFunction("__adobeQaCapturePush", (value) => {
      liveDataLayerEvents.push(value);
    });
    page.on("request", (request) => {
      const url = request.url();
      if (isAdobeBeacon(url)) beaconUrls.push(url);
    });
    await page.goto(testCase.url, {
      waitUntil: "networkidle2",
      timeout: timeoutMs,
    });
    await new Promise((resolve) => setTimeout(resolve, preActionSettleMs));
    const before = await dumpDataLayer(page, layerName);
    const beforeBeacons = beaconUrls.length;
    await installDataLayerObserver(page, layerName);
    const target = await resolveProbeCandidate(page, testCase, candidateIndex);
    if (!target) return null;
    await clickTarget(target);
    await new Promise((resolve) => setTimeout(resolve, settleMs));
    const after = await dumpDataLayer(page, layerName);
    return {
      finalUrl: page.url(),
      dataLayerEvents: liveDataLayerEvents.length
        ? liveDataLayerEvents
        : after.slice(before.length),
      beacons: beaconUrls
        .slice(beforeBeacons)
        .map(decodeBeaconUrl)
        .map(flattenBeacon),
      targetMatch: target.match,
      launch: await page.evaluate(() => ({
        satellite: Boolean(window._satellite),
        property: window._satellite?.property?.name || null,
        environment: window._satellite?.environment?.stage || null,
        appMeasurement: typeof window.AppMeasurement === "function",
      })),
    };
  } finally {
    await page.close();
  }
}

async function probeTargetInstances(
  browser,
  page,
  testCase,
  layerName,
  options
) {
  const expectedEVar12 = fixedEVar12(testCase);
  const candidates = await findProbeCandidates(page, testCase);
  if (!candidates.length) return null;
  const identifiers = candidates.map((candidate) => candidate.identity?.value);
  const distinguishable =
    identifiers.every(Boolean) &&
    new Set(identifiers).size === identifiers.length;
  if (!distinguishable) {
    const error = new Error(
      `The plan identifies ${testCase.target?.component}/${String(testCase.target?.controlType || "control").toUpperCase()}, ` +
        `but ${candidates.length} candidates do not have unique href, aria-label, or parent data-title values`
    );
    error.code = "PLAN_UNDERSPECIFIED_TARGET";
    throw error;
  }

  const matches = [];
  for (const candidate of candidates) {
    try {
      const capture = await captureProbeCandidate(
        browser,
        testCase,
        candidate.index,
        layerName,
        options
      );
      if (!capture) continue;
      if (
        !expectedEVar12 ||
        capture.beacons.some((beacon) => beacon.eVar12 === expectedEVar12)
      ) {
        matches.push({
          ...capture,
          instance: candidate.identity,
          sourceCaseId: testCase.id,
          id: `${testCase.id}::${candidate.identity.type}=${candidate.identity.value}`,
          name: `${testCase.name || testCase.id} — ${candidate.identity.value}`,
        });
      }
    } catch {
      // A candidate that cannot be exercised cannot prove the planned target.
    }
  }

  if (!matches.length) {
    const error = new Error(
      `The plan identifies ${testCase.target?.component}/${String(testCase.target?.controlType || "control").toUpperCase()} ` +
        (expectedEVar12
          ? `with fixed eVar12 ${JSON.stringify(expectedEVar12)}, but none of ${candidates.length} candidates matched`
          : `but none of ${candidates.length} distinguishable candidates could be tested`)
    );
    error.code = "PLAN_UNDERSPECIFIED_TARGET";
    throw error;
  }

  return matches.map((capture) => ({
    ...capture,
    targetMatch: {
      ...capture.targetMatch,
      source: expectedEVar12 ? "beaconEVar12" : "domInstance",
      confidence: "confirmed",
      ...(expectedEVar12 ? { expectedEVar12 } : {}),
    },
  }));
}

export async function capturePlan(
  plan,
  { timeoutMs = 45000, preActionSettleMs = 2500, settleMs = 3500 } = {}
) {
  const layerName = plan.adobe?.dataLayer || "adobeDataLayer";
  const browser = await puppeteer.launch({
    executablePath: DEFAULT_CHROME,
    headless: "new",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--window-size=1440,900",
    ],
  });

  const results = [];
  try {
    for (const testCase of plan.cases) {
      if (testCase.execution?.skip) {
        results.push({
          id: testCase.id,
          sourceCaseId: testCase.id,
          name: testCase.name || testCase.id,
          url: testCase.url,
          action: testCase.action || "page_load",
          skipped: true,
          skipReason: testCase.execution.reason,
          error: null,
          dataLayerEvents: [],
          beacons: [],
          launch: null,
          targetMatch: null,
        });
        continue;
      }
      const page = await browser.newPage();
      await page.setViewport({ width: 1440, height: 900 });
      await page.setUserAgent(USER_AGENT);

      const beaconUrls = [];
      const liveDataLayerEvents = [];
      await page.exposeFunction("__adobeQaCapturePush", (value) => {
        liveDataLayerEvents.push(value);
      });
      page.on("request", (request) => {
        const url = request.url();
        if (isAdobeBeacon(url)) beaconUrls.push(url);
      });

      let error = null;
      try {
        await page.goto(testCase.url, {
          waitUntil: "networkidle2",
          timeout: timeoutMs,
        });
        await new Promise((resolve) => setTimeout(resolve, preActionSettleMs));
        const before = await dumpDataLayer(page, layerName);
        const isInteraction = testCase.action && testCase.action !== "page_load";
        const beforeCount = isInteraction ? before.length : 0;
        const beforeBeacons = isInteraction ? beaconUrls.length : 0;
        if (isInteraction) {
          await installDataLayerObserver(page, layerName);
        }
        let targetMatch;
        try {
          targetMatch = await runAction(page, testCase);
        } catch (resolutionError) {
          const canProbe =
            testCase.action === "click" &&
            ["PLAN_UNDERSPECIFIED_TARGET", "TARGET_NOT_FOUND"].includes(
              resolutionError.code
            );
          if (!canProbe) throw resolutionError;
          const probed = await probeTargetInstances(
            browser,
            page,
            testCase,
            layerName,
            { timeoutMs, preActionSettleMs, settleMs }
          );
          if (!probed) throw resolutionError;
          results.push(
            ...probed.map((capture) => ({
              id: testCase.id,
              name: testCase.name || testCase.id,
              url: testCase.url,
              action: testCase.action || "page_load",
              error: null,
              ...capture,
            }))
          );
          continue;
        }
        await new Promise((resolve) => setTimeout(resolve, settleMs));
        const after = await dumpDataLayer(page, layerName);
        const newEvents = liveDataLayerEvents.length
          ? liveDataLayerEvents
          : after.slice(beforeCount);
        const newBeacons = beaconUrls
          .slice(beforeBeacons)
          .map(decodeBeaconUrl)
          .map(flattenBeacon);

        results.push({
          id: testCase.id,
          sourceCaseId: testCase.id,
          name: testCase.name || testCase.id,
          url: testCase.url,
          finalUrl: page.url(),
          action: testCase.action || "page_load",
          error,
          dataLayerEvents: newEvents,
          beacons: newBeacons,
          targetMatch,
          launch: await page.evaluate(() => ({
            satellite: Boolean(window._satellite),
            property: window._satellite?.property?.name || null,
            environment: window._satellite?.environment?.stage || null,
            appMeasurement: typeof window.AppMeasurement === "function",
          })),
        });
      } catch (caught) {
        error = String(caught);
        results.push({
          id: testCase.id,
          sourceCaseId: testCase.id,
          name: testCase.name || testCase.id,
          url: testCase.url,
          finalUrl: null,
          action: testCase.action || "page_load",
          error: {
            code: caught.code || "CAPTURE_ERROR",
            message: String(caught.message || caught),
          },
          dataLayerEvents: [],
          beacons: [],
          launch: null,
          targetMatch: null,
        });
      } finally {
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }

  return results;
}

export { getPath };
