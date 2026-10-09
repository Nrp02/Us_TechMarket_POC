# Data architecture

All state lives in one Supabase Postgres project. Row-level security is enabled on every table with **no policies**, so the publishable key has zero access; the server uses the secret key (`src/lib/supabase.ts`).

## Tables

| Table | One row per | Written by | Read by | Notes |
|---|---|---|---|---|
| `price_cache` | symbol | refresh | session | ~49 rows, always upserted, never grows. Holds a 16:15-ish quote reconciled to the official close |
| `intraday_snapshots` | symbol × 15-min bar | refresh | session, day-data | Unique per bar (0002). Backs sparklines and the intraday chart |
| `daily_closes` | symbol × trading day | refresh | daily-closes, session | Close, change %, volume, relative volume as it stood that day (0021). Backs YTD/MTD, volatility percentile, trend |
| `fundamentals` | Top 20 symbol | refresh | (source for history trigger) | Refreshed when 7 days stale |
| `fundamentals_history` | symbol × `known_at` | trigger `archive_fundamentals()` | story-fundamentals | What the app actually knew, never back-dated (0018) |
| `sec_filings` | filing | refresh | story-generation | Append-only 8-K metadata, Top 20 |
| `macro_indicators` | FRED series | refresh | story, market-story | CPI, unemployment, GDP, fed funds, 10-year yield |
| `news` | article | news-ingest | queries, day-news | Category is derived at read time (0006) |
| `news_summaries` | article | news-ingest | queries | AI blurb |
| `news_evidence` | article | news-ingest | day-news, story context | Source text kept server-side, never shown as UI copy (0019) |
| `events` | earnings date | daily-summary | queries | Earnings calendar |
| `timeline_events` | symbol × day × event | timeline-rebuild | queries | Replaced per day in one transaction (0023) |
| `daily_summaries` | symbol × day | daily-summary | queries | "What Happened Today" |
| `stories` | symbol × day | story-generation | queries | `sections` JSONB, including `checks` |
| `market_stories` | day | market-story-generation | queries | Same shape as `stories` |

Dropped: `watchlist` (0017, [ADR 0009](adr/0009-remove-the-watchlist.md)) and `story_analysis_attempts` (0022, the retired correction-feedback ledger).

## Functions

| Function | Purpose | Migration |
|---|---|---|
| `news_days()` | Distinct ET days with news, for the date picker. Returns ~8 rows instead of scanning ~1,400 | 0009 |
| `activity_days()` | Trading days with a stored snapshot | 0015 |
| `replace_timeline_events()` | Delete-and-insert one day atomically under an advisory lock | 0023 |
| `prune_old_data()` | Seven-day retention | 0007, 0008 |
| `archive_fundamentals()` | Trigger copying fundamentals into history | 0018 |

## Migrations

`supabase/migrations/0001…0023`, applied with `npm run migrate` (`scripts/migrate.mts`). Migrations 0022 and 0023 are applied to the shared database.

## Retention

Seven days, enforced by real deletion because the free tier has no automatic storage cap. The cleanup job (`data-retention-cleanup`, daily 04:00 UTC) is pure SQL and **never empties a table**: each `DELETE` only runs if a newer row still exists (0008). This matters because Supabase pauses an idle free-tier project after about a week; on resume the last surviving rows are kept so pages are not empty.

Excluded on purpose: `price_cache` (fixed size, pruning would break pages) and `events` (small and bounded).

Deletion can lag by up to 24 hours, so the News page also applies a read-time floor (`news-retention.ts`). It is a whole Eastern-time day, not a rolling instant, and is anchored on the newest stored day. Two earlier versions were wrong in measurable ways: a rolling `now - 6 days` opened to 8 days or closed to 6 across daylight-saving changes, and a clock-only floor hid exactly the rows the keep-last guard preserved.

## Read limits

PostgREST caps a response at 1,000 rows. `db-read.ts` treats a truncated read as an error rather than returning partial data, and asks for `count: "exact"` only when `.limit()` is itself the ceiling. This fired once in production: the News date picker selected every row to build a set of days and hit `1000 of 1402 rows`, taking the page down until `news_days()` replaced it (`history/resolved-and-open-items.md`).
