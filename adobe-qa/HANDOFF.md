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

## Status: what is code vs what is only design

Be precise about this. The three rows below are not the same maturity.

### 1. In the committed CLI, executed

TCP UTMs on `theclimatepledge.com`, via `npm run qa -- --plan examples/tcp-utm.plan.json`.
Output committed at `reports/2026-09-01T18-17-15-396Z.txt` (2/2 pass, eVar41–46, `%Tracking code%` warning on eVar0, suite `amznclimatepledgeproduction`).

### 2. Observed live, but with throwaway scripts, NOT this CLI

Energy `…/stories/spotlight-on-energy`, slides 9–14, three C40 cards, clicked in a real browser:

| Card | Plan claimed | Site actually sent |
|---|---|---|
| Fact Card Image Large | CTA Clicks / event1 | **Link Clicks / event2** (eVar14 dest, eVar17 title) |
| Fact Card Video Large | CTA Clicks / event1 | **Video Start / event13** (eVar11 Video Modal, eVar13 name) |
| Fact Card Image Small | CTA Clicks / event1 | **Link Clicks / event2** |

Also diverging: `pageName`, `siteSection`, `component` (`C40` vs `c40-dashboard`), `pageSection` (`approach`/`optimize`).

This is real captured evidence, not a paste from a prior report. But the scripts that produced it were ad-hoc and were never committed. Reproducing it through the CLI requires the `click` action plus target resolution.

### 3. Design only, zero lines of code

Nothing below exists in `src/`. Grep confirms: no `canonicalEvent`, no `PLAN_DEFECT`, no SDR reader, no video/scroll sequences.

- SDR as third source of truth / canonical dictionary
- `canonicalEvent` resolution and secondary locators
- `PLAN_DEFECT` derived from plan-vs-SDR mismatch
- Multi-step video (Start→25→50→75→Complete) and scroll (25/50/75/100) with waits
- `docs/qa-playbook.md`, `knowledge/sdr.xlsx` — paths referenced in this doc, not created yet
- PdM upload, URL box, HTML report, hosting

The current `compare.mjs` assumes one action produces one event. That assumption breaks for video and scroll and must be replaced, not extended.

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

Knowledge on disk: `docs/qa-playbook.md`, `knowledge/sdr.xlsx`, example plans. Not in the system prompt.

Host later: Cloud Run + Chrome (not Vercel-only). AI Studio = optional cosmetics only.

## Do not

- Re-litigate TCP vs WWS report suites as one schema.
- Invent missing plan values.
- Treat Adobe Debugger as required (we sniff DL + `/b/ss/`).
- Run video complete / full scroll matrix until playbook + waits exist.
