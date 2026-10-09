# Performance and reliability

Numbers here were measured; the unabridged record is `history/serving-latency.md`.

## Latency

Query time was dominated by the cost of each *request*, not rows or bytes: one row cost about the same as 840 (~155 ms either way). Page time was therefore (queries in sequence) × (cost per request). Two fixes, both reverse earlier defaults:

1. **Region.** `vercel.json` pins functions to `sin1`; they defaulted to `iad1` while the database is in Asia. Per request: `iad1` 260 ms, `hnd1` 225 ms (tried because the database was assumed to be in Tokyo; it was worse), **`sin1` 155 ms**.
2. **Read cache.** Reads are wrapped in `unstable_cache` at 60 s (`cache-policy.ts`). Ingestion writes every 15 minutes, so re-querying each render bought freshness that did not exist.

Server-side median, 13 interleaved samples per cell:

| Route | before | + region | + cache |
|---|---|---|---|
| Home | 1453 ms | 547 ms | **93 ms** |
| Today's Activity | 1252 ms | 557 ms | **92 ms** |
| News | 821 ms | 378 ms | **94 ms** |

News is the control: its queries were untouched, so its gain is region plus cache only.

Traps found on the way: `export const dynamic = "force-dynamic"` silently disables the data cache; a `Map` does not survive `unstable_cache` (it serialises to `{}`); a stale `next start` serves an old build. Reducing the count of queries that already run in parallel buys nothing: three concurrent scans took 0.34 s against 0.28 s for one.

Each Vercel deployment starts with an empty data cache, so the warm-cache workflow and a weekday cron open every dated page ahead of visitors.

## Reliability

### A failed read must not look like an empty table
Early on, `queries.ts` destructured only `{ data }`. supabase-js reports failure as `{ data: null, error }`, so a network blip became `[]`, and `unstable_cache` then served that empty result to everyone for at least 60 s. Symptoms were charts, prices or overview cards intermittently missing on every device. Reproduced: of 12 sequential requests, the first 6 had no sparklines. Cold start was tested and ruled out (10/10 clean after 18 idle minutes).

`db-read.ts` fixes this at the source ([ADR 0004](adr/0004-failed-reads-throw.md)): each attempt gets a fresh `AbortSignal.timeout(2000)`, three attempts, and a thrown error afterwards. A rejected promise writes no cache entry. The three page routes set `maxDuration = 30` because the retry budget can exceed the platform default.

### Upstream failure
- Per-symbol try/catch in refresh: one failing symbol never overwrites good rows.
- Yahoo is an unofficial endpoint; failure means volume is *unknown*, never an error.
- AI failures defer to the next scheduled run; nothing retries immediately. News validates per entry, so one bad entry no longer discards a batch of 50.
- Stories are published even when a check fails, so a day always has content ([ADR 0008](adr/0008-publish-stories-and-record-checks.md)).

### Capacity ceilings
| Ceiling | Value | Handling |
|---|---|---|
| PostgREST response | 1,000 rows | Truncation throws; day and date reads paginate or use an RPC |
| Vercel function | 60 s on job routes | Work is split across ticks and warm-cache slices |
| Finnhub | 60 calls/min | Concurrency 5; a cold start can still hit it and defers work |
| Retention | 7 days | `prune_old_data()` |

Measured headroom to watch: a busy news day holds 253 articles; the 36-hour window around one reaches roughly 350–400 against the 1,000-row ceiling.

## Resilience testing

An end-to-end test simulated a Finnhub outage and rate limit against a local production build and confirmed the app showed a fallback or error state instead of crashing; results, and the browser-automation traps that mimic site bugs, are in `history/execution-plan.md`.
