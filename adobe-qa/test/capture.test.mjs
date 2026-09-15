import assert from "node:assert/strict";
import test from "node:test";
import { capturePlan } from "../src/capture.mjs";

test("captures a data layer push before same-tab navigation", async () => {
  const page = encodeURIComponent(`
    <script>window.adobeDataLayer = [];</script>
    <a id="cta" href="about:blank"
      onclick="window.adobeDataLayer.push({
        event: 'CTA Clicks',
        userInteraction: { ctaButton: 'Report' }
      })">Report</a>
  `);
  const [capture] = await capturePlan(
    {
      adobe: { dataLayer: "adobeDataLayer" },
      cases: [
        {
          id: "navigating-cta",
          url: `data:text/html,${page}`,
          action: "click",
          selector: "#cta",
        },
      ],
    },
    { preActionSettleMs: 0, settleMs: 100 }
  );

  assert.equal(capture.error, null);
  assert.deepEqual(capture.dataLayerEvents, [
    {
      event: "CTA Clicks",
      userInteraction: { ctaButton: "Report" },
    },
  ]);
});
