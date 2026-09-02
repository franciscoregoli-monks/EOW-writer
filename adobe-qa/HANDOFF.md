# Handoff — Adobe QA tool (for next agent)

Owner analytics: Francisco. Scope locked. Do not reopen host-vs-Studio, dashboards, or report-suite ingest.

## What this is

Internal tool: **Measurement Plan + URL → readable QA report** (data layer + Launch beacon only).

Not: Adobe Workspace, dashboards, public app, browser extension (later), stuffing SDR into model memory.

## Hierarchy

1. **SDR** = canonical events/eVars/props (`[INT][NEW][WWS]Amazon Sustainability - SDR.xlsx`).
2. **PdM** = this implementation’s claims (PPTX/CSV). Can be wrong.
3. **Observed** = `adobeDataLayer` + AppMeasurement `/b/ss/`.
4. Plan vs SDR mismatch → `PLAN_DEFECT` (still run QA against **canonicalEvent**).
5. Plan/SDR vs site → `PASS` / `FAIL`. Missing target → `NOT TESTABLE`.

Primary match key: **canonicalEvent** (SDR + interaction type). Secondary: component, pageSection, aria-label/text, href, card variant. Screenshot last.

Event families (playbook, not chat memory):

- Almost all custom events = **click**.
- **Scroll** = wait 25/50/75/100 (SDR `event5–8`, not plan `event15–17`).
- **Video** = watch in one session: Start → 25 → 50 → 75 → Complete (`event13/15/16/17/14`). Not a CTA click.

## Status

Implemented and unit-tested:

- Real SDR XLSX reader with discovered headers; artifact at
  `knowledge/wws-sdr.json` (37 events, 52 eVars, 3 props, 23/37 push references,
  3 WWS report suites).
- Fixed/options/dynamic/removed eVar semantics. Props are reference-only.
- Canonical event resolution and plan-defect findings.
- Secondary click target resolution.
- Four exclusive report buckets: PASS, FAIL, PLAN_DEFECT, NOT_TESTABLE.
- Explicit NOT_TESTABLE branch for video/scroll.
- Live WWS CLI plan at `examples/wws-energy.plan.json`.
- Google Sheet parser for exact `Order` joins across Events + Pushes. It uses
  `valueSemantics.mjs` directly; the supplied PPTX parser is not a dependency.

Still not implemented:

- Authenticated Google Sheets API. Public/link-shared Sheets can be fetched
  directly; private Sheets currently require two CSV exports.
- Multi-step video and scroll (deliberately post-MVP).
- Upload page, HTML report and hosting.

Run `npm test`, `npm run qa:wws`, or the legacy TCP `npm run qa:tcp`.

## Provenance of this branch

The first MVP was written before the parallel Vask files were available.
They were later supplied and reviewed. `sheet-plan-parser.js` was ported to
ESM and wired to the existing value semantics. `pptx-plan-parser.js` remains a
reference only. `adobe-scraper.js` was not adopted because its element locator
never ran live; the existing `capture.mjs` and `targetResolver.mjs` have.
`diff-engine.js` confirmed the four value kinds but was not copied wholesale
because it shares the intentionally deferred one-action/one-event limitation.

## Sources (uploads, not necessarily in git)

- PdM: `[Amazon] Energy Spotlights - Measurement Plan & Implementation Guide.pptx`
- SDR: `[INT][NEW][WWS]Amazon Sustainability - SDR.xlsx` — RSIDs `amznsdevelopment|staging|production`. Sheets: Events, eVars, props, Data Layer Pushes, etc.

Energy plan flags (SDR wins): scroll IDs mixed with video; slide 34 scroll 100% labeled Video complete/event14; video slides lack DL push; `destinationURL` vs SDR `destinationLink`.

## Product skeleton (build next, UX later)

```text
[ PdM file ] [ URL ] [ Run QA ]  →  TESTABLE | NOT TESTABLE | PLAN DEFECTS
each case: event, eVars, expected vs actual
```

Knowledge on disk: `docs/qa-playbook.md`, `knowledge/wws-sdr.json`, example
plans. Not in the system prompt.

Host later: Cloud Run + Chrome (not Vercel-only). AI Studio = optional cosmetics only.

## Do not

- Re-litigate TCP vs WWS report suites as one schema.
- Invent missing plan values.
- Treat Adobe Debugger as required (we sniff DL + `/b/ss/`).
- Run video complete / full scroll matrix until playbook + waits exist.
