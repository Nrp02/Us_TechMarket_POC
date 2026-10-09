# Operations runbook

## Environments

| | Local | Production |
|---|---|---|
| App | `npm run dev` | `https://ustechmarket.vercel.app`, deployed from `main` only |
| Database | **The same Supabase project** | The same |
| Scheduler | none | Supabase Cron |

Because the database is shared, **a local job run writes production rows** and can consume work the scheduled job would otherwise do. Run local jobs deliberately. A separate test project was rejected as too costly for a $0 build (`history/ai-call-budget.md`).

## Setup

1. Copy `.env.example` to `.env.local` and fill it in (Finnhub, Supabase URL and keys, Gemini, OpenRouter, Groq, FRED, `CRON_SECRET`, `APP_BASE_URL`, `DATABASE_URL`).
2. `npm run migrate` applies `supabase/migrations/`.
3. `npm run setup-cron` provisions the schedules; `npm run setup-cron -- warm-cache` provisions only that one. It is idempotent and reads secrets from `.env.local`; nothing is committed.
4. `npm run backfill-daily-closes` and `npm run backfill-fundamentals` seed history once.

Changing schedules, running live ingestion and deploying are the owner's decisions.

## Schedules (UTC)

| Job | Cron | Route |
|---|---|---|
| `intraday-snapshots` | `*/15 13-21 * * 1-5` | `/api/refresh` |
| `news-ingest` | `7 0,2,4,6,8,10,12,14,16,18,20,21 * * *` | `/api/ingest-news` |
| `daily-summaries` | `5-55/10 22-23 * * 1-5` | `/api/daily-summary` |
| `today-story` | `0-55/5 20-23 * * 1-5` | `/api/story` |
| `warm-cache` | `40 14 * * 1-5` | `/api/warm-cache` |
| `data-retention-cleanup` | `0 4 * * *` | SQL `prune_old_data()` |

Windows are wide enough for both EST and EDT; the market-hours check lives in the endpoint, evaluated in `America/New_York`, so a UTC window cannot drift by an hour at a daylight-saving change. The 21:07 news cycle is after the close in both and before the 22:05 summary start.

## Deploy

1. Merge to `main`. Vercel builds; a branch push gives only a preview URL.
2. The `Warm cache` GitHub workflow runs on a successful Production deployment (needs repository secret `CRON_SECRET`) and opens every dated page in three slices. It can also be run by hand.
3. Check a route the change touched, not just the home page.

After deleting `.next`, run `npx next typegen`.

## Verifying a scheduled job

- Look in `net._http_response`. `cron.job_run_details` shows "succeeded" for a queued request even when the route returns an error.
- Route bodies report what happened (`generated`, `skippedRateLimited`, `failed`, `aiCalls`).
- Error boundaries render client-side: verify in a browser, not with curl. Brandfetch refuses curl and headless user agents.

## Testing safely

| Task | How |
|---|---|
| Manual Gemini run | Swap the test key into `.env.local` first (separate Google project); a manual `/api/daily-summary` costs 1 of the 20 daily requests |
| Groq tests | `.scratch/narrative-audit/with-test-key.sh <cmd>` |
| Anything | Remember it writes production rows |
| Local performance numbers | Free port 3000 first (`lsof -ti:3000 \| xargs kill -9`); a stale `next start` silently serves an old build |

## Common failures

| Symptom | Likely cause | Check |
|---|---|---|
| A page shows the error screen | A read threw (timeout or truncation); the log line starts `[read]` | Vercel logs for the digest and message |
| Charts or prices intermittently empty | Historically a read swallowed as empty; now should throw | `db-read.ts`; do not "degrade" to `[]` |
| No stories for a day | Groq 429 or all slots failed | `net._http_response` for `/api/story`; stocks defer to later slots |
| A News blurb queue growing | OpenRouter capacity | `/api/ingest-news` returns 502 when no blurb stored |
| Stale numbers | Up to 60 s read cache, 15-min snapshots | Expected |
| Supabase paused | Idle free-tier project | Resume; retention keeps last rows |

## Verification commands

```
npm test              # 268 tests
npx tsc --noEmit
npm run lint          # errors under untracked .scratch/ are pre-existing
```
