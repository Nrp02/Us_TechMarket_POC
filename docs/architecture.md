# Architecture map

> Where things live, updated from the current code on 2026-10-05: imports, `db.from()`/`db.rpc()` calls, and `scripts/setup-cron.mts`. Use it to jump to the right file; read the file before trusting a detail. If this map and the code disagree, the code wins — fix the map.

## The shape in one picture

```
Supabase Cron (scripts/setup-cron.mts)
  │  POST + CRON_SECRET
  ▼
src/app/api/*/route.ts  ──►  job module in src/lib  ──►  upstream clients  ──►  Finnhub / Yahoo / SEC / FRED / AI
                                     │ writes
                                     ▼
                              Supabase tables
                                     ▲ reads (db-read.ts, unstable_cache 60s)
src/app/*/page.tsx  ──►  src/lib/queries.ts
      │
      ▼
src/components/*   (no upstream calls; logos hotlink Brandfetch)
```

Two directions that never meet: **jobs write**, **pages read**. A page importing an upstream client fails lint.

## Scheduled jobs

| Cron job | Schedule (UTC) | Route | Job module | Writes |
|---|---|---|---|---|
| `intraday-snapshots` | `*/15 13-21 * * 1-5` | `api/refresh` | `refresh.ts` (+ `refresh-rows.ts`), then `timeline-rebuild.ts` | `price_cache`, `intraday_snapshots`, `daily_closes`, `fundamentals`, `sec_filings`, `macro_indicators`, `timeline_events` |
| `news-ingest` | `7 0,2,…,20,21 * * *` (in script; live cron may differ) | `api/ingest-news` | `news-ingest.ts` | `news`, `news_summaries`, `news_evidence` |
| `daily-summaries` | `5-55/10 22-23 * * 1-5` | `api/daily-summary` | `daily-summary.ts` | `daily_summaries`, `timeline_events` |
| `today-story` | `0-55/5 20-23 * * 1-5` | `api/story` | `story-generation.ts`, `market-story-generation.ts` | `stories`, `market_stories` |
| `data-retention-cleanup` | `0 4 * * *` | pure SQL (`0007`/`0008`) | `prune_old_data()` | deletes old rows |

Market-hours gating lives in `market.ts` (`America/New_York`). Routes check `CRON_SECRET` and return 503 when unset.

## Upstream clients (only jobs may import these)

| File | Upstream | Used for |
|---|---|---|
| `finnhub.ts` | Finnhub `/quote`, `/stock/metric`, profile | price, average volume, fundamentals |
| `finnhub-news.ts` | Finnhub news | company + market news |
| `finnhub-events.ts` | Finnhub calendar | earnings date/call |
| `yahoo.ts` | Yahoo chart | today's volume, intraday bars, 16:00 close |
| `sec-edgar.ts` | SEC EDGAR submissions | 8-K metadata (Top 20) |
| `fred.ts` | FRED | macro series incl. DGS10 |
| `openrouter.ts` | OpenRouter | news blurbs |
| `gemini.ts` | Gemini | AI Daily Summary; also exports `SAFETY_RULES` |
| `groq.ts` | Groq | Today's Story, Market Story |

## Job pipelines

**Refresh** — `refresh.ts` fetches per symbol (concurrency 5, per-symbol try/catch so failures never overwrite good rows), `refresh-rows.ts` shapes the rows, `closing-price.ts` swaps in the official close after the bell, `fomc-calendar.ts` is static FOMC dates.

**News** — `news-ingest.ts`: fetch → store every article (uncapped) → `news-select.ts` picks ≤50 without a blurb → one OpenRouter call → `news-summary-response.ts` validates the whole batch before persisting. Relevance matching (`mentionsSymbol`) is in `symbols.ts`.

**Daily Summary** — `daily-summary.ts`: loads the day with `day-data.ts` (one batched read), builds `timeline.ts` events, one Gemini call per 5 stocks; prompt, schema and input shaping live in `daily-summary-prompt.ts`; `significance.ts` for the badge.

**Today's Story** (per stock, Top 20) — `story-generation.ts` orchestrates:
- input: `story-input.ts` composes pure engines — `peer-comparison.ts`, `movement-classification.ts`, `volatility.ts`, `trend-detection.ts`, `period-performance.ts`, `fundamentals.ts`, `significance.ts`
- context: `day-news.ts`, `daily-closes.ts`, `story-fundamentals.ts` (`fundamentals_history`), `story-business-context.ts`, SEC filings, FRED rates
- prompt + checks: `story-guideline.ts` (reasoning method), `story-analysis-quality.ts` (prompt rendering, schema, deterministic validators)
- call: `story-analysis-call.ts` (one Groq call, fixed effort/token ceiling; no feedback ledger or correction call)
- scheduling: one pending stock per five-minute slot, with a rotating starting symbol; locally computed shown/logged checks publish with the story
- stored shape: `story-sections.ts`

**Market Story** — `market-story-generation.ts` with `market-story-input.ts` (`market-breadth.ts`, `volatility.ts`, `trend-detection.ts`, `period-performance.ts`, `fred.ts`, `fomc-calendar.ts`) and `market-story-guideline.ts`; shares `story-analysis-call.ts`/`story-analysis-quality.ts`/`story-sections.ts` with Today's Story.

## Read path

| Module | Role |
|---|---|
| `supabase.ts` | server client (throws at import without env — keep testable logic out of modules that import it) |
| `db-read.ts` | every read: timeout, retry with fresh signal, throws on error/truncation. Builders add `.retry(false)` so postgrest-js does not retry underneath it |
| `queries.ts` | all page reads, cached: `getMarketSession`, `getActivity`, `getSessionStamp` |
| `queries-news.ts` | news reads, cached: `getNews`, `getNewsTeaser`, `getNewsDates`, `NewsItem` |
| `cache-policy.ts` | the shared 60s read-cache TTL and the rule that a failed read must throw |
| `session.ts` / `day-ticker.ts` | `readPageDay` resolves the date, then `readPageTickers` reads its figures alongside the rest of the page; a stock missing the newest Session defaults to its own last Session and reads historical peer figures |
| `activity-date.ts`, `news-date.ts` | date labels/options and date normalization; Session callers consume the resolved date from queries |
| `news-category.ts` | Stock vs Market tab, sector filters |
| `news-retention.ts` | the News page's oldest-day floor |
| `format.ts` | all ET formatting |
| `logos.ts` | Brandfetch URLs |
| `symbols.ts` | Top 20, 43 tracked, ETFs, `PEERS`, `CIK_BY_SYMBOL`, sectors |

Session-dependent headings and stock metadata use the same resolved query payload as their figures. `getActivity` is memoized within a render as well as cached for 60 seconds. News remains calendar-day based; the Market teaser deliberately stays recent. The one-off story backfill and its historical-input module were removed after that repair completed.

## Pages → components

| Route | Page | Components |
|---|---|---|
| `/` | `app/(market)/page.tsx` | `session-digest`, `market-overview`, `market-story` (+ `section-card`, `story-charts`), `news-teaser`, `date-picker` |
| `/todays-activity/[symbol]` | `app/todays-activity/[symbol]/page.tsx` | `symbol-switcher`, `company-logo`, `status-badge`, `activity-stats`, `intraday-chart`, `upcoming-events`, `activity-timeline`, `daily-summary-card`, `todays-story` (+ `section-card`, `story-charts`), `date-picker` |
| `/todays-activity` | redirects to the first Top-20 symbol | — |
| `/news` | `app/news/page.tsx` | `news-list` (+ `news-thumbnail`), `date-picker` |

Shell (`app/layout.tsx`): `top-bar`, `keyboard-shortcuts`, `session-marker`, `chart-gradients`, the sky (`night-sky`, `sky-interaction`, `meteors`). Shared: `section-heading`, `skeleton`, `sparkline`. Each route has its own `loading.tsx`; grids must mirror the real component (Mirrored Grid Rule, `DESIGN.md`). `error.tsx` catches render throws.

## Tables

| Table / RPC | Written by | Read by |
|---|---|---|
| `price_cache` | refresh | session |
| `intraday_snapshots` | refresh | session, day-data, queries |
| `daily_closes` | refresh | daily-closes, session |
| `fundamentals` | refresh | (source for the history trigger) |
| `fundamentals_history` | trigger `archive_fundamentals()` on `fundamentals` (0018) | story-fundamentals |
| `sec_filings` | refresh | story-generation |
| `macro_indicators` | refresh | story + market-story generation |
| `news`, `news_summaries`, `news_evidence` | news-ingest | queries, day-news, story-business-context |
| `events` | daily-summary | queries |
| `timeline_events` | timeline-rebuild via the `replace_timeline_events` RPC (migration 0023, one transaction per day) | queries |
| `daily_summaries` | daily-summary | queries |
| `stories` / `market_stories` | story / market-story generation | queries |
| `news_days()`, `activity_days()` RPCs | migrations 0009, 0015 | queries |

Migrations: `supabase/migrations/0001…0023` (0022 retires the analysis-attempt table; 0022 and 0023 are applied to the shared database), applied with `scripts/migrate.mts`. `watchlist` was dropped in `0017`.

## Scripts

`setup-cron.mts` (provision schedules — owner-run), `migrate.mts`, `backfill-daily-closes.mts`, `backfill-fundamentals.mts`, `smoke-news-ai.mts` (provider smoke test), `test-resolve.mts`.

## Where to start for common tasks

| Task | Start at |
|---|---|
| A number on a page is wrong | `queries.ts` → `session.ts`/`day-ticker.ts` → the writer in `refresh.ts` |
| Story text is wrong or unsafe | `story-analysis-quality.ts` (prompt + validators), `story-guideline.ts`, `story-input.ts` |
| Add a stock | `symbols.ts` (+ `logos.ts` mark; `logos.test.ts` enforces it) |
| News missing or unsummarised | `news-ingest.ts`, `news-select.ts`, `openrouter.ts` |
| Layout / visual | `DESIGN.md`, then the component; update the matching `loading.tsx` |
| Change a schedule | `scripts/setup-cron.mts` (not `vercel.json`) |
