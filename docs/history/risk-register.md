> Moved verbatim from CLAUDE.md on 2026-09-29 (commit 1dbde83). History and reasoning, not a summary of current behaviour: where this and the code disagree, the code wins.

## Risk register

| # | Risk | Mitigation | Owner |
|---|---|---|---|
| 1 | News pipeline overruns Day 12 | Pre-agreed cut order above; deadline doesn't move | Project owner decides only if the cut order itself is somehow insufficient |
| 2 | AI hallucinates numbers, invents facts, or overreaches into causation/prediction/advice | Full rules in "AI Safety / Data Integrity Rules" below — structured input only, no invented values, no unsupported causal claims, no predictions or recommendations | Claude Code writes the prompt; owner spot-checks at the Phase 4 gate |
| 3 | Finnhub rate limit hit during a 10-stock batch | Queue/delay between calls, designed in from Day 8, not patched in afterward. Already in place: `mapLimit` in `src/lib/refresh.ts` caps concurrency at 5 (module-private — `refreshMarketData` is its only caller), and pages make zero upstream calls so traffic cannot affect the limit | Claude Code |
| 4 | Gate review stalls the critical path (this is a solo-reviewer project — no parallel work possible) | Owner blocks calendar time in advance for each gate date above | Project owner |
| 5 | A scheduled ingestion job fails silently — `pg_net` is fire-and-forget, so `cron.job_run_details` shows success even when the endpoint returned 401 or timed out | Treat `net._http_response` as the source of truth when checking any scheduled job. A green cron row proves only that the request was queued | Claude Code |
| 6 | Public ingestion endpoint used to burn upstream rate limits | `CRON_SECRET` guard that **fails closed** (503 when unset). Rotating it means updating `.env.local`, `vercel env add`, then re-running `npm run setup-cron` — two places, easy to half-do | Claude Code |

