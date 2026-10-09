# Requirements

How each requirement is met, and where it is enforced.

## Functional

| ID | Requirement | Met by |
|---|---|---|
| F1 | Show current price, change %, volume and relative volume for each tracked stock | `refresh.ts` → `price_cache`; Market and Stocks pages |
| F2 | Flag unusual moves with one rule used everywhere | `significance.ts` ([ADR 0006](adr/0006-one-significant-movement-rule.md)) |
| F3 | Show an intraday chart and an event timeline for a stock | `intraday_snapshots`, `timeline_events` |
| F4 | Summarise each day's news per article | `news-ingest.ts` → `news_summaries` |
| F5 | Give a plain per-stock account of the day | `daily-summary.ts` → `daily_summaries` ("What Happened Today") |
| F6 | Give an interpretive per-stock analysis (Top 20) | `story-generation.ts` → `stories` (Today's Story, 8 sections) |
| F7 | Give a market-level analysis | `market-story-generation.ts` → `market_stories` |
| F8 | Browse the last seven Sessions | Date picker over `activity_days()` / `news_days()` |
| F9 | Filter news by sector | `news-category.ts` |
| F10 | Show closing prices that are the official close | `closing-price.ts` ([ADR 0005](adr/0005-official-close-from-the-1600-bar.md)) |

## Non-functional

| ID | Requirement | Target | Met by |
|---|---|---|---|
| N1 | Cost | $0 | Free tiers only; [ai-architecture.md](ai-architecture.md) budgets every quota |
| N2 | Visitors never spend a metered quota | Zero upstream calls per page view | Lint-enforced separation ([ADR 0003](adr/0003-pages-read-the-database-only.md)) |
| N3 | Page latency | ~90 ms server median | Region `sin1` + 60 s read cache ([performance-and-reliability.md](performance-and-reliability.md)) |
| N4 | A failed read is never shown as "no data" | Reads throw | `db-read.ts` ([ADR 0004](adr/0004-failed-reads-throw.md)) |
| N5 | Scheduled jobs are not publicly triggerable | 503 if unset, 401 if wrong | `CRON_SECRET` on every route ([api-contracts.md](api-contracts.md)) |
| N6 | AI never invents figures or advises | Prompted and partly checked | [ai-architecture.md](ai-architecture.md) |
| N7 | Every story day has content | Published even when a check fails | [ADR 0008](adr/0008-publish-stories-and-record-checks.md) |
| N8 | Works on phone, iPad, laptop | Designed widths | `DESIGN.md`; owner tests iPhone 12 / iPad gen 10 |
| N9 | Survives upstream failure | Per-symbol failures never overwrite good rows | `refresh.ts`; Yahoo failure means "unknown" |
| N10 | Bounded storage | Seven days | `prune_old_data()` ([data-architecture.md](data-architecture.md)) |

## Constraints

- No user accounts. No paid service. Free-tier quotas: Finnhub 60 calls/min, Gemini 20 requests/day/project, OpenRouter 50 requests/day, Groq 8,000 tokens/min.
- Vercel Hobby allows cron at most once a day, so scheduling lives in Supabase ([ADR 0002](adr/0002-supabase-cron-not-vercel-cron.md)).
- Local and production share one Supabase database ([operations-runbook.md](operations-runbook.md)).
