# Documentation

US TechMarket answers one question per US tech stock per trading day: **"What happened to this stock today?"** These documents describe how it is designed, built, run and verified.

> Where a document and the code disagree, the code wins. Every claim here names the file, migration, commit or `docs/history/` entry it comes from.

## Suggested reading order

| # | Read | To learn |
|---|---|---|
| 1 | [project-overview.md](project-overview.md) | What the product is, who it is for, what it deliberately does not do |
| 2 | [requirements.md](requirements.md) | The functional and non-functional requirements and how each is met |
| 3 | [system-design.md](system-design.md) | Components, the "jobs write, pages read" split, each pipeline |
| 4 | [data-architecture.md](data-architecture.md) | Tables, functions, migrations, retention |
| 5 | [analysis-engine.md](analysis-engine.md) | The deterministic calculations the AI is handed |
| 6 | [ai-architecture.md](ai-architecture.md) | Three AI providers, prompts, quotas, safety rules, checks |
| 7 | [api-contracts.md](api-contracts.md) | The five scheduled routes and their responses |
| 8 | [operations-runbook.md](operations-runbook.md) | Schedules, deploys, how to verify a job, how to test safely |
| 9 | [performance-and-reliability.md](performance-and-reliability.md) | Measured latency and failure behaviour |
| 10 | [security-and-compliance.md](security-and-compliance.md) | Secrets, access control, licences, the not-advice boundary |
| 11 | [testing-strategy.md](testing-strategy.md) | What the 268 tests and the lint rules protect |
| 12 | [submission-summary.md](submission-summary.md) | One-page summary for a reviewer |
| 13 | [demo-script.md](demo-script.md) | A walkthrough order for a live demo |

## Reference

- [data-sources/](data-sources/) — one file per upstream: Finnhub, Yahoo, SEC EDGAR, FRED, Brandfetch, AI providers.
- [adr/](adr/) — architecture decision records (see [adr/README.md](adr/README.md)).
- [architecture.md](architecture.md) — the code map: which file owns what.
- [history/](history/) — the unabridged reasoning, measurements and reversed decisions.
- `../DESIGN.md` — the visual contract. `../PRODUCT.md` — product truth. `../CONTEXT.md` — glossary. `../CLAUDE.md` — working rules for the coding agent.
