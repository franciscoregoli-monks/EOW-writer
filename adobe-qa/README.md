# Adobe QA MVP

Internal runner that compares:

1. WWS SDR canonical events/eVars
2. Measurement-plan claims
3. Live `adobeDataLayer` pushes and Launch `/b/ss/` beacons

Props are reference-only. Adobe Workspace/dashboards and multi-step video/scroll
execution are out of scope.

## Run

```bash
cd adobe-qa
npm install
npm run qa -- --plan examples/tcp-utm.plan.json
npm run qa:wws
```

Chrome is required (`google-chrome-stable`, or set `CHROME_PATH`).

The WWS command exits `1` only for implementation `FAIL` cases. Plan fails
and unsupported cases stay visible without independently failing the process.

## Google Sheet plan

The working plan format is two tabs named `Events` and `Pushes`. Rows are
joined by exact `Order`; there is deliberately no fuzzy matching.

For a Sheet shared by link:

```bash
npm run qa:sheet -- \
  --sheet "https://docs.google.com/spreadsheets/d/SHEET_ID/edit" \
  --url "https://sustainability.aboutamazon.com/..." \
  --suite amznsproduction
```

For a private Sheet, export both tabs as CSV:

```bash
npm run qa:sheet -- \
  --events-csv Events.csv \
  --pushes-csv Pushes.csv \
  --url "https://sustainability.aboutamazon.com/..." \
  --suite amznsproduction
```

The parser groups all event/eVar/prop rows with the same `Order`, joins the
Pushes row with that exact `Order`, and converts it to the canonical runner
shape. It imports the shared semantics from `valueSemantics.mjs`; it does not
depend on the supplied CommonJS PPTX parser.

## PPTX plan

PPTX plans can also run directly:

```bash
npm run qa:pptx -- \
  --pptx "/path/to/Measurement Plan.pptx" \
  --url "https://sustainability.aboutamazon.com/..." \
  --suite amznsproduction
```

The parser reads text boxes in visual Y order, pairs specification and
DataLayer Push slides, and uses the same shared value semantics as the Sheet
parser. Scroll/video slides are included but reported as `NOT_TESTABLE`. See
the committed direct-PPTX production run at
[`examples/energy-pptx.report.txt`](examples/energy-pptx.report.txt).

## WWS SDR

`knowledge/wws-sdr.json` is a committed artifact generated from the real SDR:

```bash
npm run sdr:build -- --source /path/to/WWS-SDR.xlsx
```

The reader discovers literal header rows instead of assuming A1 or relying on
inflated worksheet row counts.

## Plan format

JSON is the canonical executable format. Each case is one user action.

```json
{
  "name": "Home CTAs",
  "adobe": { "dataLayer": "adobeDataLayer" },
  "cases": [
    {
      "id": "TCP-001",
      "url": "https://example.com/?utm_source=linkedin",
      "action": "page_load",
      "expected": {
        "dataLayer": { "event": "pageload" },
        "beacon": { "pageName": "Home", "eVar41": "linkedin" }
      }
    }
  ]
}
```

CSV also works. Prefix data-layer fields with `dl.` and Adobe beacon fields with `aa.`. See `examples/plan.template.csv`.

WWS cases add:

```json
{
  "interactionType": "link",
  "planEvent": { "id": "event2", "name": "Link Clicks" },
  "target": {
    "component": "c43-highlight-slider",
    "label": "8M",
    "href": "https://example.com"
  },
  "expected": {
    "eVars": {
      "eVar3": "\"Energy Spotlight\"",
      "eVar14": "<URL of external destination>",
      "eVar12": "removed"
    }
  }
}
```

Value semantics:

- `"Fixed"` → exact match
- `"A", "B"` → one allowed value
- `<Page URL>` → presence only
- `removed` → excluded

Click targets resolve via explicit selector/domHints, then component,
pageSection, label, href and card variant. Video and scroll cases appear as
`NOT_TESTABLE` with a reason.

## Output

`reports/<timestamp>.txt` — PASS/FAIL/PLAN_FAIL/NOT_TESTABLE
`reports/<timestamp>.json` — full data layer events and decoded beacons

Every plan case appears exactly once. See
[`docs/qa-playbook.md`](docs/qa-playbook.md) for precedence and event-family
rules. A committed live example is available at
[`examples/wws-energy.report.txt`](examples/wws-energy.report.txt).

## Mapping checked on the beacon

| Plan key | Adobe query param |
|---|---|
| `eVarN` | `vN` |
| `propN` | `cN` |
| `pageName` | `pageName` |
| `events` | `events` |
| `hitType` | `pe` present → `link`, else `pageview` |
| `reportSuite` | `/b/ss/{suite}/` |
