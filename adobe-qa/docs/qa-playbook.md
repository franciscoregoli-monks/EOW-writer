# Adobe QA playbook — MVP

This file is operational knowledge. Do not put the SDR or historical plans in
the model prompt.

## Sources and precedence

1. The WWS SDR defines canonical event IDs/names and eVar names.
2. The measurement plan defines the interaction and its expected values.
3. The browser provides observed `adobeDataLayer` pushes and `/b/ss/` beacons.

If a plan name, ID, and interaction type disagree, report `PLAN_DEFECT`.
Continue the implementation QA against the SDR event when the case is a
single click.

TCP and WWS have different report suite schemas. Never combine them.

## Event families

### Click

The only executable family in this MVP. Includes CTA, link and download
interactions. Resolve a target in this order:

1. Confirmed selector
2. Plan `domHints`
3. Component
4. Page section
5. `aria-label` or visible text
6. `href`
7. Card variant

Screenshots are a later fallback.

The HTML element type does **not** determine the analytics event. An
`<a href>` can be an editorial CTA (`event1` + `eVar12`) or a Link Click
(`event2` + `eVar14`/`eVar17`), including internal or external redirects. For
single clicks, use the plan's declared event; DOM attributes and destination
are locators only.

If the plan expects CTA/event1 but the measured hit sends Link Click/event2,
that is an implementation `FAIL`, not a `PLAN_DEFECT`.

### Video

Canonical WWS sequence:

`event13 Start → event15 25% → event16 50% → event17 75% → event14 Complete`

Multi-step playback is not implemented in the MVP. Every video case must
appear as `NOT_TESTABLE`; never silently skip it.

### Scroll

Canonical WWS sequence:

`event5 25% → event6 50% → event7 75% → event8 100%`

Multi-step scrolling is not implemented in the MVP. Every scroll case must
appear as `NOT_TESTABLE`.

### Web Vitals

WWS reserves `event85` through `event89` for a Web Vitals implementation that
is currently in progress. They may appear alongside component events and must
not affect component PASS/FAIL.

The current SDR artifact does not yet define these IDs. Treat the range as a
documented supplemental rule, not as an unexplained-event warning. Do not
invent the final per-ID metric mapping until the SDR is updated.

## Value semantics

Only events and eVars affect PASS/FAIL. Props are stored as reference.

| Plan syntax | Meaning | Check |
|---|---|---|
| `"AI Insights"` | fixed | exact match |
| `"A", "B", "C"` | options | actual must be one option |
| `<Page URL>` | dynamic | actual must be present |
| `removed` | not applicable | exclude from scoring |

Never invent a missing plan value.

### Placeholder values are failures

`N/A`, `null`, `undefined`, `none`, `-` and similar mean the implementation had
nothing to send. They are present but carry no analysable data, so they fail
every check, including dynamic presence checks. They are also never absorbed
into a page-level plan finding: missing data is an implementation defect, not
an outdated plan.

## Output buckets

Every plan case appears exactly once:

- `PASS`
- `FAIL`
- `PLAN_DEFECT`
- `NOT_TESTABLE`

A `PLAN_DEFECT` may also show the implementation QA result. An unsupported
video/scroll case remains `NOT_TESTABLE` and carries plan-defect findings as
secondary details.
