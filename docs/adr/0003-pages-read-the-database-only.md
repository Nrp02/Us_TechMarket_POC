# ADR 0003 — Pages read the database only; upstream calls come from scheduled jobs

- **Status:** Accepted
- **Decided:** 2026-08-14 (`eslint.config.mjs`, commit `84f5e21`)
- **Recorded:** 2026-10-10

## Context

Finnhub allows 60 calls a minute and Gemini 20 requests a day. If a page view could trigger either, two visitors could exhaust a quota that the scheduled jobs depend on, with no way to buy more before a demonstration. AI output generated per visitor would also differ between visitors.

## Decision

1. Every upstream call (Finnhub, Yahoo, SEC, FRED, any AI) originates from a scheduled server job behind `CRON_SECRET`.
2. Pages read Supabase only, through `src/lib/queries.ts`.
3. AI output is generated once per cycle and stored.
4. The rule is enforced mechanically: ESLint `no-restricted-imports` fails the build if a `page.tsx`, `layout.tsx` or component imports an upstream client, a job module, `supabase` or `db-read`.

## The one exception

Company logos are images loaded by the browser from Brandfetch's CDN. The rule protects metered quotas; a free static-asset host cannot exhaust anything the app uses, and its licence permits only hotlinking ([data-sources/brandfetch.md](../data-sources/brandfetch.md)). The exception is not to be extended to anything that returns data.

## Consequences

- Visitor load costs zero upstream or AI calls; two visitors on the same page cost the same as one.
- Pages are a function of stored rows, which makes them cacheable ([ADR 0004](0004-failed-reads-throw.md)) and testable.
- Data is only as fresh as the last job: 15 minutes for prices, plus up to 60 seconds of read cache.
- Adding a stock requires no per-visitor fetch because every candidate symbol is ingested each cycle.
