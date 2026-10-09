# ADR 0004 — A failed read throws; it never returns an empty result

- **Status:** Accepted
- **Decided:** 2026-08-29 (`src/lib/db-read.ts`, commit `c449803`)
- **Recorded:** 2026-10-10

## Context

Users reported that charts, prices or the Market Overview cards intermittently showed nothing, on every device. The cause was in the read layer: `queries.ts` contained no reference to `error`. supabase-js returns failure as `{ data: null, error }` rather than rejecting, so a network blip became `[]` or `null`. Because reads are wrapped in `unstable_cache` for 60 seconds, that empty result was then served to every visitor.

Measured: of 12 sequential requests to the live Home page, the first 6 rendered with no sparklines; the database held all rows throughout (675 snapshot rows a day with no gaps, 296 of 296 cron runs successful). "Cold start" was tested and ruled out: 10 of 10 requests clean after 18 idle minutes.

## Decision

Every read goes through `src/lib/db-read.ts`:
- each attempt gets a fresh `AbortSignal.timeout(2000)`;
- up to three attempts with delays between them;
- after the last attempt it **throws**, with a log line prefixed `[read]` carrying the label and timing;
- a truncated response (PostgREST's 1,000-row cap) is an error, not a partial result;
- builders pass `.retry(false)` so postgrest-js does not retry underneath.

`unstable_cache` writes no entry for a rejected promise, so throwing is what keeps a wrong answer out of the cache. The three page routes set `maxDuration = 30` because the retry budget can exceed the platform default.

Hard rules: never return `[]` on failure, never "degrade gracefully" after retries are spent, and request `count: "exact"` only when `.limit()` is itself the ceiling.

## Consequences

- A transient failure now shows `error.tsx` once rather than a wrong page to everyone for a minute. The error boundary renders client-side, so it must be tested in a browser.
- `db-read.ts` imports nothing from `lib/supabase.ts`, so the retry and truncation logic is unit-testable.
- The truncation guard later fired for real (News date picker read 1,402 rows against a 1,000 cap) and worked as designed; the fix was an RPC that returns only the days (`news_days()`), not weakening the guard.
