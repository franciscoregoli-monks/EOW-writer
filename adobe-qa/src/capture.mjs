import puppeteer from "puppeteer-core";
import { decodeBeaconUrl, flattenBeacon, isAdobeBeacon } from "./decodeBeacon.mjs";

const DEFAULT_CHROME =
  process.env.CHROME_PATH ||
  "/usr/bin/google-chrome-stable";

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

async function runAction(page, testCase) {
  const action = testCase.action || "page_load";
  if (action === "page_load") return;
  if (action === "click") {
    if (!testCase.selector) throw new Error(`${testCase.id}: click requires selector`);
    await page.waitForSelector(testCase.selector, { timeout: 15000 });
    await page.click(testCase.selector);
    return;
  }
  throw new Error(`${testCase.id}: unsupported action "${action}"`);
}

export async function capturePlan(plan, { timeoutMs = 45000, settleMs = 3500 } = {}) {
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
      const page = await browser.newPage();
      await page.setViewport({ width: 1440, height: 900 });
      await page.setUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
      );

      const beaconUrls = [];
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
        const before = await dumpDataLayer(page, layerName);
        const beforeCount = before.length;
        const beforeBeacons = beaconUrls.length;
        await runAction(page, testCase);
        await new Promise((resolve) => setTimeout(resolve, settleMs));
        const after = await dumpDataLayer(page, layerName);
        const newEvents =
          testCase.action && testCase.action !== "page_load"
            ? after.slice(beforeCount)
            : after;
        const newBeacons = beaconUrls
          .slice(testCase.action && testCase.action !== "page_load" ? beforeBeacons : 0)
          .map(decodeBeaconUrl)
          .map(flattenBeacon);

        results.push({
          id: testCase.id,
          name: testCase.name || testCase.id,
          url: testCase.url,
          finalUrl: page.url(),
          action: testCase.action || "page_load",
          error,
          dataLayerEvents: newEvents,
          beacons: newBeacons,
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
          name: testCase.name || testCase.id,
          url: testCase.url,
          finalUrl: null,
          action: testCase.action || "page_load",
          error,
          dataLayerEvents: [],
          beacons: [],
          launch: null,
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
