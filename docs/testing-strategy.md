# Testing strategy

## Commands

```
npm test              # node:test over src/**/*.test.ts — 268 tests in 43 files
npx tsc --noEmit
npm run lint          # errors under untracked .scratch/ are pre-existing
npm run check:motion  # route-motion check; check:safari-motion for the Safari stutter
```

The test runner is Node's built-in `node:test` with type stripping and a small path-alias resolver (`scripts/test-resolve.mts`); there is no framework dependency.

## Design principle: keep logic out of the module that cannot load

`lib/supabase.ts` creates its client at import and throws without environment variables, so anything defined next to it cannot be loaded by the test runner. Rules therefore live in pure modules with no database import (`closing-price.ts`, `news-retention.ts`, `significance.ts`, `movement-classification.ts`, …). That is what makes most of the product's logic testable.

## What is covered

| Area | Test files (examples) | What they protect |
|---|---|---|
| Classification and numbers | `significance`, `movement-classification`, `peer-comparison`, `volatility`, `trend-detection`, `period-performance`, `market-breadth`, `fundamentals` | Thresholds at their boundaries; null inputs yield `unknown`, never a guess |
| Prices | `closing-price`, `refresh-rows`, `refresh`, `day-ticker`, `session` | Official close selection, per-symbol failure isolation, session resolution |
| Read layer | `db-read`, `queries`, `day-news`, `news-retention`, `news-date`, `activity-date` | Fresh abort signal per retry, truncation throws, daylight-saving-safe date floors, pagination |
| News | `news-ingest`, `news-summary-response`, `finnhub-news`, `news-category`, `openrouter` | Per-entry validation, queue behaviour, category derivation |
| Story pipeline | `story-input`, `story-generation`, `story-analysis-quality`, `story-validators`, `story-sections`, `market-story-input`, `market-story-generation`, `groq` | Prompt shape, schema, figure and sign validators, rounding tolerance, trend wording |
| Summaries and timeline | `daily-summary`, `daily-summary-prompt`, `timeline`, `timeline-rebuild` | Batching, prompt builder, atomic rebuild |
| Symbols and logos | `logos`, `sector-map`, `market` | Every stock has a mark, ambiguous tickers never match as words, market-hours gating in `America/New_York` |

Tests are written to fail for a stated reason. For example, `db-read.test.ts` asserts both that a retry rebuilds the query and that each attempt gets a fresh abort signal, because a reused signal would turn every retry into a silent no-op. The engine-label tests use the 2026-10-08 figures that exposed the missing sector comparison.

## Lint as architecture

ESLint's `no-restricted-imports` blocks `page.tsx`, `layout.tsx` and `src/components/**` from importing any upstream client, job module, `supabase` or `db-read` ([ADR 0003](adr/0003-pages-read-the-database-only.md)). A violation fails `npm run lint`.

## What tests cannot cover

| Gap | How it is covered instead |
|---|---|
| Error boundaries | They render client-side; verify in a browser, not curl |
| Logos | Brandfetch refuses curl and headless user agents; check in a real browser |
| Layout at designed widths | Manual checks on phone, iPad and laptop; the owner tests iPhone 12 / iPad gen 10 |
| AI prose quality | Reviewed by reading stored output against the input (see the 2026-10-09 review in [ai-architecture.md](ai-architecture.md)); the shown/logged checks are partial |
| Scheduled jobs | Verified in `net._http_response` ([operations-runbook.md](operations-runbook.md)) |

## Smoke and audit tooling

`scripts/` holds the provider smoke test (`smoke-news-ai.mts`) and backfills. `.scratch/narrative-audit/` (untracked) holds the read-only scripts used to audit story quality against stored data.
