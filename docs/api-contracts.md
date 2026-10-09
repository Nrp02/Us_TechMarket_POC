# API contracts

The app exposes no public data API and no user-facing mutation. The only HTTP endpoints under `src/app/api` are five **scheduled job routes**. Pages read data directly through server components.

## Authentication (all five routes)

| Condition | Response |
|---|---|
| `CRON_SECRET` not set in the environment | `503 {"error":"CRON_SECRET is not configured"}` (fails closed, never open) |
| Missing or wrong `Authorization: Bearer <secret>` | `401 {"error":"unauthorized"}` |
| Authorised | the job runs |

All routes are `POST`, set `maxDuration = 60`, and are called by Supabase Cron (`pg_net`) with the secret read back from Supabase Vault at run time.

## Routes

| Route | Cron job | Gate | Success body |
|---|---|---|---|
| `POST /api/refresh` | `intraday-snapshots` | Market hours (America/New_York) | `{skipped:"market closed"}` outside the session, otherwise refresh counts |
| `POST /api/ingest-news` | `news-ingest` | none | Ingest result with `aiCalls` and counts; `502` when the AI call stored no blurb |
| `POST /api/daily-summary` | `daily-summaries` | After the close | `{skipped:"market still open"}` before it, otherwise generation result |
| `POST /api/story` | `today-story` | After the close | Stories result plus `marketStory: {status}` (`deferred`, `failed` with message, or generated) |
| `POST /api/warm-cache?part=0\|1\|2` | `warm-cache` and the GitHub workflow | none | `200` when every page responded, `502` listing failures; `400` if `part` is not 0, 1 or 2 |

Any thrown error returns `502 {"error": message}` so the cron response table records it.

## Verifying a run

Check `net._http_response` in Supabase, not `cron.job_run_details`: `pg_net` reports a queued request as success even if the route later fails ([operations-runbook.md](operations-runbook.md)).

## Idempotency

Every job is safe to call again: snapshots are unique per bar, news and stories skip work already done, `replace_timeline_events` is transactional, and warm-cache only reads. This is what lets spare cron ticks double as retries.

## Page routes (for completeness)

| Route | Reads |
|---|---|
| `/` | `getMarketSession`, news teaser, Market Story |
| `/todays-activity/[symbol]` | `getActivity` (price, chart, timeline, summary, story) |
| `/todays-activity` | redirects to the first Top-20 symbol |
| `/news` | `getNews`, `getNewsDates` (query params: date, tab, sector) |

Each has a `loading.tsx` that mirrors the real grid, and an `error.tsx` that renders client-side when a read throws.
