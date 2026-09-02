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

Still not implemented:

- Google Sheet `sheet-plan-parser.js`: that file was never provided to this
  repo. Current executable inputs remain JSON/CSV.
- Multi-step video and scroll (deliberately post-MVP).
- Upload page, HTML report and hosting.

Run `npm test`, `npm run qa:wws`, or the legacy TCP `npm run qa:tcp`.

## Provenance of this branch

This branch was written from scratch in one session. No `diff-engine.js`, `sheet-plan-parser.js`, `adobe-scraper.js` or `HANDOFF-CURSOR.md` was ever provided to this agent, and `git log --all` confirms none ever existed in this repo. If those exist elsewhere, they were not seen, evaluated, or rejected here. Whoever merges the two efforts should diff them deliberately rather than assume this branch supersedes anything.

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
