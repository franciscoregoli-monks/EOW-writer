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

## Already proven

| Run | Result |
|---|---|
| TCP UTMs `theclimatepledge.com` | Page load beacons OK. eVar41–46. eVar0 = `%Tracking code%` warning. Report suite `amznclimatepledgeproduction`. |
| Energy `…/stories/spotlight-on-energy` slides 9–14 (3 C40 cards) | Launch works. Image large/small → **Link Clicks / event2**. Video Watch → **Video Start / event13**. Plan claimed **CTA Clicks / event1** → PLAN_DEFECT. pageName/siteSection/component also diverge from slides. |

Code: [`adobe-qa/`](.) CLI `npm run qa -- --plan examples/tcp-utm.plan.json`. PR: `cursor/adobe-qa-mvp-57e3`.

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
