# Architecture — Adobe QA capture

## Same-tab navigation used to drop the data-layer push

**Resolved 2 Sep 2026.**

Until this date, `capture.mjs` dumped `window.adobeDataLayer` only *after* the click had settled. Any CTA that navigated in the same tab (internal story, PDF, outgoing link) replaced the page first. The originating push was gone. Adobe beacons could still be observed from the network log; the data-layer half of the comparison was empty (`actual: null`).

That meant **no outgoing or same-tab link could produce a PASS**. The homepage hero CTA (`/2025-report`) is the proof case: Debugger already had `event89,event1` and the expected eVars; the data layer was missing only because capture read the destination page.

The fix wraps `adobeDataLayer.push` before the click and clones each item as it happens. After settle, those live clones are preferred over a post-navigation dump. Evidence: `examples/homepage-hero-pass.plan.json` and `examples/homepage-hero-pass.report.txt`.
