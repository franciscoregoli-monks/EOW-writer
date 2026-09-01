# Adobe QA MVP

Internal runner: measurement plan vs `adobeDataLayer` and Launch `/b/ss/` beacons.

**Next agent:** read [`HANDOFF.md`](HANDOFF.md) first.

Compares a measurement plan (source of truth) against:

1. What the page pushes to the data layer (`adobeDataLayer` by default)
2. What Adobe Launch actually sends (AppMeasurement `/b/ss/` beacon)

Report suite / dashboards are out of scope. The beacon `reportSuite` field is only used to confirm Launch pointed the hit at the expected suite.

## Run

```bash
cd adobe-qa
npm install
npm run qa -- --plan examples/tcp-utm.plan.json
```

Chrome is required (`google-chrome-stable`, or set `CHROME_PATH`).

## Plan format

JSON is the canonical format. Each case is one user action.

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

Supported actions today: `page_load`, `click` (needs `selector`).

## Output

`reports/<timestamp>.txt` — PASS/FAIL per variable  
`reports/<timestamp>.json` — full data layer events and decoded beacons

Exit code `1` if any case fails.

## Mapping checked on the beacon

| Plan key | Adobe query param |
|---|---|
| `eVarN` | `vN` |
| `propN` | `cN` |
| `pageName` | `pageName` |
| `events` | `events` |
| `hitType` | `pe` present → `link`, else `pageview` |
| `reportSuite` | `/b/ss/{suite}/` |
