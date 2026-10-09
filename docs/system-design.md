# System design

## The shape

```
Supabase Cron (scripts/setup-cron.mts)
  │  POST + Authorization: Bearer CRON_SECRET
  ▼
src/app/api/*/route.ts ──► job module in src/lib ──► upstream client ──► Finnhub / Yahoo / SEC / FRED / AI
                                   │ writes
                                   ▼
                            Supabase Postgres
                                   ▲ reads (db-read.ts, unstable_cache 60 s)
src/app/*/page.tsx ──► src/lib/queries.ts
      │
      ▼
src/components/*   (no upstream calls; logos hotlink Brandfetch)
```

**Jobs write; pages read. The two never meet.** A page that imports an upstream client or the database client fails lint ([ADR 0003](adr/0003-pages-read-the-database-only.md)). This is the central design decision: it makes visitor traffic unable to exhaust any metered quota, and it makes each page a pure function of stored rows.

## Technology

| Layer | Choice | Why |
|---|---|---|
| App | Next.js 16 App Router, React 19, TypeScript | One repo for pages and job routes |
| Data | Supabase Postgres (free tier) | Managed Postgres plus `pg_cron` and `pg_net` |
| Scheduling | Supabase Cron | Vercel Hobby allows cron once a day ([ADR 0002](adr/0002-supabase-cron-not-vercel-cron.md)) |
| Hosting | Vercel, functions pinned to `sin1` | Measured 155 ms per round trip to the database, against 260 ms from `iad1` |
| Styling | Tailwind CSS 4; three.js for the night-sky backdrop | See `DESIGN.md` |
| Tests | `node:test` with type stripping | No test framework dependency |

A second programming language is added only for a significant benefit; none has been.

## Components

| Component | Responsibility | Where |
|---|---|---|
| Schedulers | Fire HTTP POSTs on cron expressions | Supabase Cron, provisioned by `scripts/setup-cron.mts` |
| Job routes | Authenticate, gate on market hours, call one job module | `src/app/api/{refresh,ingest-news,daily-summary,story,warm-cache}/route.ts` |
| Job modules | Fetch, compute, call AI, write rows | `refresh.ts`, `news-ingest.ts`, `daily-summary.ts`, `story-generation.ts`, `market-story-generation.ts`, `timeline-rebuild.ts` |
| Upstream clients | One file per provider | `finnhub*.ts`, `yahoo.ts`, `sec-edgar.ts`, `fred.ts`, `gemini.ts`, `openrouter.ts`, `groq.ts` |
| Pure engines | Deterministic calculations, no I/O | `significance.ts`, `peer-comparison.ts`, `movement-classification.ts`, `volatility.ts`, `trend-detection.ts`, `period-performance.ts`, `market-breadth.ts` |
| Read layer | Cached, throwing reads | `queries.ts`, `queries-news.ts`, `db-read.ts`, `cache-policy.ts` |
| UI | Server components plus a few client popovers | `src/app`, `src/components` |

The file-by-file map is [architecture.md](architecture.md).

## Pipelines

### Refresh (every 15 minutes in market hours)
Cron `*/15 13-21 * * 1-5` UTC → `/api/refresh`. For the 43 stocks plus 6 ETFs: Finnhub quote and metrics, Yahoo volume and intraday bars, SEC 8-K metadata (Top 20), FRED macro (when stale). Concurrency is 5, each symbol in its own try/catch so one failure never overwrites a good row. After the bell, `closing-price.ts` swaps in Yahoo's 16:00 bar as the official close. Then `timeline-rebuild.ts` rebuilds the day's timeline in one transaction (`replace_timeline_events`).

### News (12 cycles a day)
Cron `7 0,2,4,…,20,21 * * *` → `/api/ingest-news`. Fetch from Finnhub, store every article and its source text (`news_evidence`), read the queue from the database (articles with no blurb, newest first, at most 50), make one OpenRouter call, then keep each valid entry and drop invented, duplicate or empty ones (`news-summary-response.ts`). An article stays queued until blurbed. The route returns 502 when the AI call stores no blurb.

### AI Daily Summary (after the close)
Cron `5-55/10 22-23 * * 1-5` → `/api/daily-summary`. `day-data.ts` loads the day in one batched read, `timeline.ts` builds events, Gemini is called once per five stocks (four calls cover the Top 20).

### Today's Story and Market Story (after the close)
Cron `0-55/5 20-23 * * 1-5` → `/api/story`. One pending stock is generated per five-minute slot with a rotating start symbol so a failing stock cannot starve the rest; the Market Story is one more call. Input assembly, prompt, call and checks are in [ai-architecture.md](ai-architecture.md).

### Warm-cache
Cron `40 14 * * 1-5` and a GitHub Actions workflow after each production deploy open every dated page in three slices, because each Vercel deployment starts with an empty data cache. Nothing is fetched from an upstream.

### Retention
Cron `0 4 * * *` runs `prune_old_data()` directly in SQL ([data-architecture.md](data-architecture.md)).

## Read path

`page.tsx` → `queries.ts` (wrapped in `unstable_cache`, 60 s) → `db-read.ts` (2 s timeout, 3 attempts, throws on error or truncation) → Supabase. `session.ts` resolves which Session a page shows; a stock missing the newest Session falls back to its own last Session. Pages still render per request because they read `searchParams`; they are not statically generated.

## Design decisions at a glance

| Decision | Record |
|---|---|
| Scheduling in Supabase | [ADR 0002](adr/0002-supabase-cron-not-vercel-cron.md) |
| Pages read only the database | [ADR 0003](adr/0003-pages-read-the-database-only.md) |
| Failed reads throw | [ADR 0004](adr/0004-failed-reads-throw.md) |
| Official close from the 16:00 bar | [ADR 0005](adr/0005-official-close-from-the-1600-bar.md) |
| One significance rule | [ADR 0006](adr/0006-one-significant-movement-rule.md) |
| Three AI providers by quota | [ADR 0007](adr/0007-three-ai-providers-by-quota.md) |
| Publish stories, record checks | [ADR 0008](adr/0008-publish-stories-and-record-checks.md) |
| Watchlist removed | [ADR 0009](adr/0009-remove-the-watchlist.md) |
| Sector-wide label | [ADR 0010](adr/0010-sector-wide-engine-label.md) |
