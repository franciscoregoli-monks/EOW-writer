# Adobe QA capability status

| Capability | State | Evidence |
|---|---|---|
| Energy PPTX ingestion and live run | CODE | `cd adobe-qa && npm run qa:energy` |
| Page-level defect rollup and bucket accounting | CODE | `cd adobe-qa && npm test` |
| Missing planned component classification | CODE | `cd adobe-qa && npm test` |
| Hierarchical DOM target resolution | CODE | `cd adobe-qa && npm test` |
| C-40 instance resolution without a section, title, or href in the plan | DESIGN | The Energy plan does not provide a stable instance value. |
| Video and scroll sequences | DESIGN | Deliberately outside the MVP. |
