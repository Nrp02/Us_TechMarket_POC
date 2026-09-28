> Moved verbatim from CLAUDE.md on 2026-09-29 (commit 1dbde83). History and reasoning, not a summary of current behaviour: where this and the code disagree, the code wins.

## Serving latency — measured from inside the deployed function

The read path was slow for reasons that had nothing to do with the queries themselves, and the two fixes below came from measurement rather than reasoning. Both reverse an earlier decision; don't undo them without re-measuring.

**What the measurement showed.** A query returning **one row** costs the same as one returning **840** — ~155ms either way, timed from inside the Vercel function. The price is per *request*, not per row or per byte, and Next.js itself contributes ~1–4ms (`handlerTotalMs` equalled `dbTotalMs` exactly). So page time was almost precisely *(number of queries that must run in sequence) × (per-request cost)*, and the fix is to attack those two numbers rather than to tune SQL.

This also means **reducing the count of queries that already run in parallel buys nothing.** Three concurrent copies of the same scan measured 0.34s against 0.28s for one. Query *depth* is what costs; query *count* mostly does not.

**Fix 1 — `vercel.json` pins functions to `sin1`.** They defaulted to `iad1` (US East) while the Supabase project sits in Asia, so every round trip crossed the Pacific. Measured per-request cost by region: `iad1` 260ms, `hnd1` (Tokyo) 225ms, **`sin1` (Singapore) 155ms**. Tokyo was tried on the theory that the database was there and was worse, which is what settled Singapore. Nothing else in the repo sets a region, so this file is the whole change.

**Fix 2 — the read helpers in `src/lib/queries.ts` are wrapped in `unstable_cache` at `CACHE_SECONDS` = 60.** Ingestion only writes every 15 minutes, so re-querying on every render was buying freshness that did not exist. `getTickers`, `getNews` and `getActivity` are cached. *(This described the watchlist arriving as an argument and becoming part of the cache key, which kept the Company and Industry tabs per-visitor — that split no longer exists; see the Phase 4.5 reversal note and the "News categories" entry under Resolved items. `getNews` now caches on the stock/market split, which carries no per-visitor argument.)*

Three traps here, all of which were hit:

- **`export const dynamic = "force-dynamic"` silently disables the data cache.** It implies `revalidate = 0`, so `unstable_cache` was a no-op while it was set and the pages re-queried on every render. It has been removed from Home, News and Today's Activity — they still render per request because each reads `searchParams` (date/tab/sector filters), and the build output still marks all three `ƒ (Dynamic)`. Check that marking if the setting is ever reinstated. *(This used to attribute the dynamic rendering to `readWatchlist()` reading a cookie — that function no longer exists, see the Phase 4.5 reversal note; `searchParams` was always the actual reason it stayed dynamic.)*
- **`getSparklines` returns a `Map`, which does not survive the cache** — it serialises to `{}` and every sparkline comes back empty. This is why the wrapper sits on `getTickers` (which returns plain `Ticker[]`) rather than on `getSparklines`. Every other cached shape was checked for `Date` fields for the same reason; all of them are already strings.
- **A stale `next start` on port 3000 will silently serve an old build.** `npm start` fails with `EADDRINUSE` while the previous process keeps answering, and `pkill -f "next start"` does not always match it. Two rounds of measurement were thrown away to this. Use `lsof -ti:3000 | xargs kill -9` and confirm the port is free before trusting any number.

**Result**, server-side median, 13 interleaved samples per cell:

| Route | before | + region | + cache |
|---|---|---|---|
| Home | 1453ms | 547ms | **93ms** |
| Today's Activity | 1252ms | 557ms | **92ms** |
| News | 821ms | 378ms | **94ms** |

`/news` is the honest control: its query code was never touched, so its improvement is entirely region plus caching. All three now sit at the floor of what the function itself costs.

The accepted cost is up to 60s of staleness, which is well inside the 15-minute ingestion cadence — a visitor cannot be shown figures from a different session than the one already on screen. Raise `CACHE_SECONDS` if a demo wants fewer database reads; lower it only with a reason, since the reads it prevents are the entire page cost.

### A transient read was cached as "no data" — reads now throw

**The reported symptom was "sometimes the charts don't show, sometimes the price doesn't show, sometimes the Market Overview cards show nothing", on every device.** It looked like an upstream failure and was not. `src/lib/queries.ts` contained **zero occurrences of the string `error`** — every read destructured `{ data }` alone. supabase-js reports a failure as `{ data: null, error }` rather than by rejecting, so a network blip or an aborted fetch arrived as `data: null` and every call site collapsed it to `[]` / `null` / an empty `Map`. **A failed read was indistinguishable from an empty table.** The write path had checked all along (`refresh.ts:135`, `:150`).

**The caching above is what turned one blip into a bug.** `unstable_cache` stored the empty result and served it to every visitor for at least 60s, and stale beyond that during a revalidation. The two are one mechanism, which is why this note sits here: caching makes a wrong answer durable, and throwing is what keeps it out of the cache — `unstable_cache` writes **no entry for a rejected promise**. Do not reintroduce a read that swallows, and do not "degrade gracefully" by returning `[]` once the retries are spent; that is the bug exactly.

**Reproduced, then verified against the database.** 12 sequential requests to the live Home page: the first **6 rendered with zero sparklines** (only the 4 gradient `<defs>`), correct prices throughout; the next 6 were complete. 90 further samples under continuous traffic were 90/90 clean. Meanwhile production held **675 snapshot rows per day — 27 points × 25 symbols — for five straight trading days with no gap for any symbol**, all 25 `price_cache` rows fresh, 296/296 cron runs succeeded over 7 days, and replaying `getSparklines`' own two queries 25× returned 675 rows every time. Nothing was missing.

**"Cold start" was the obvious hypothesis and it is wrong — do not re-chase it.** The bad burst happened to be the first traffic after an idle period. Tested directly: after ~18 minutes idle, a burst of 10 requests came back **10/10 clean**. The trigger is a random transient. No warm-up or keep-alive fixes this; the defect is in making one transient durable for everyone.

The fix is `src/lib/db-read.ts`, which every read goes through. Four things about it worth knowing:

- **`build` is a callback taking an `AbortSignal`, not a pre-built query.** A `PostgrestFilterBuilder` is a thenable that executes exactly once — awaiting the same object twice resolves to the first result rather than re-running it — so a retry loop has to reconstruct the query per attempt. Passing the signal in is also what gives each attempt a *fresh* `AbortSignal.timeout`; a reused signal is already aborted by attempt 2, which would make every retry a silent no-op. `db-read.test.ts` asserts both.
- **`READ_TIMEOUT_MS` matters more than the retry count.** Nothing in the read path had any timeout before, and a hung fetch is strictly worse than an error — it burns the whole function and still returns nothing. Because the budget can now outlast the platform default, `export const maxDuration = 30` was added to the three page routes, which previously set none.
- **Only ask for `{ count: "exact" }` when the query's `.limit()` IS the ceiling**, never when it is an intentional smaller cap. PostgREST counts every matching row and ignores `limit`, so a deliberately capped query would report a shortfall on every healthy read. This is why `getNewsUncached` requests a count on the day path and not on the teaser path.
- **`day-data.ts` reports truncation instead of throwing, via `readRowsWithCount`.** A background job can finish its work and carry the problem out in its response; a page cannot. Its `truncated` contract is unchanged.

**The 1000-row ceiling is real but was not this bug.** Measured on this project: an unbounded `select` on the 3,375-row `intraday_snapshots` returned exactly **1000 rows with `error: null`**. `getSparklines` reads 675 of that, and truncation orders ascending — so it would drop the newest point of every sparkline, not remove all 42. It becomes an active bug at **38 tracked symbols** (38 × 27 = 1026). The explicit `.limit(1000)` now in the source does not raise the ceiling; it makes it visible.

**It later fired for real, on a different read — see "The News page's date picker read the whole table" below.** The prediction above was right about the mechanism and wrong about which query would hit it first: `news`, not `intraday_snapshots`.

**`src/lib/db-read.ts` imports nothing from `lib/supabase.ts`**, for the same mechanical reason recorded for `news-select.ts` and `watchlist.ts`: that module builds its client at module load and throws without env vars, so anything defined beside it cannot be loaded by the test runner. Keep it that way — it is what makes the retry and truncation logic testable at all.

---

