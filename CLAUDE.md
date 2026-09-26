# US TechMarket — Build Instructions for Claude Code

> Read this whole file before writing any code. It is the single source of truth — every decision below was already argued through and locked with the project owner. Do not re-litigate a locked decision; if something here seems wrong, flag it, don't silently deviate.

## Agent skills

### Issue tracker

Local markdown under `.scratch/`. See `docs/agents/issue-tracker.md`.

### Domain docs

Single-context: `CONTEXT.md` at the repo root. See `docs/agents/domain.md`.

## What you are building

A school demo — an AI daily intelligence app for tracking US Technology stocks. Core question the product answers, per stock, once a day: **"What happened to this stock today?"**

Workflow: Watch → Collect → Filter → Understand → Summarize.

Constraints that shape every decision below: no user accounts, no budget (free tiers only), optimized for "a working, presentable, deployable link to show a professor" — not scale, not robustness.

## Stack

- **Frontend + Backend**: Next.js (App Router), one repo
- **Database**: Supabase (Postgres, free tier)
- **Scheduled jobs**: Supabase Cron (`pg_cron` + `pg_net`) — **not** Vercel Cron; see the reversal note below for why
- **Hosting**: Vercel (free tier)
- **AI**: Gemini API, model **`gemini-3.5-flash`** (Gemini 2.5 Flash is unavailable — see the reversal note below), free tier only — no billing enabled on the Google AI Studio project, ever. See "Free tier verification" under Open Items — don't trust a specific rate-limit number from training data or a blog post; check the live console at build time.

## Division of labor: this file vs. DESIGN.md

**Reversed by the owner.** Visual design used to be assigned to a separate "Claude Design" pass, with this file forbidden from saying anything about how things look. That split is gone: whoever builds the page also owns layout composition, colour, spacing, typography, theme, and hierarchy, and does not wait on an external visual reference.

The division that remains is between two files, and it is worth keeping:

- **This file is the content contract** — what data and functionality must exist on each page, and what was explicitly cut. Every content decision here went through several rounds of scoping with the owner, so if a visual pass adds or drops a *field, section, or feature* on its own, this file wins and the visual is re-derived from the checklist.
- **`DESIGN.md` is the visual contract** — tokens, type ramp, form language, component character, and the named rules. It is generated from the built code by `/impeccable document`, so it describes what exists rather than what was hoped for. `PRODUCT.md` holds durable product truth alongside it.

The content contract does **not** constrain composition. "Five cards", "eight columns exactly" and the like fix what must be *present and legible*; they do not fix the arrangement, the scale, the density, or the visual weight of any of it. A pass that changes how the page is composed while keeping every required field is working as intended.

## Language & Technology Policy

Programming language is NOT locked.

Claude Code may choose TypeScript, Python, SQL, or another appropriate
language when it provides a meaningful technical advantage.

Language selection must be based on:
- compatibility with the existing architecture
- deployment constraints
- free-tier availability
- maintainability
- reliability
- performance
- library/API support
- implementation complexity

Do not introduce a second language unless the benefit is significant enough
to justify the additional runtime, deployment, dependency, and maintenance cost.

The architecture and product requirements are locked; the implementation
language is not.

## Data sources

| Need | Source | Note |
|---|---|---|
| Price, company news, earnings calendar | Finnhub (free tier, 60 calls/min) | Primary source for almost everything |
| **Today's traded volume + intraday bars** | Yahoo Finance `query1.finance.yahoo.com/v8/finance/chart` | **Finnhub's free tier cannot supply this** — see the reversal note below. Scoped to this one gap only; unofficial endpoint, so callers treat failure as "volume unknown", never as an error. |
| Average daily volume | Finnhub `/stock/metric` (`10DayAverageTradingVolume`, reported in millions) | Denominator for relative volume |
| Market index proxies — all five cards | Finnhub `/quote` on ETF symbols: `QQQ` (NASDAQ 100), `SPY` (S&P 500), `DIA` (Dow Jones), `XLK` (Technology), `VIXY` (Volatility) | Confirmed live in Phase 1. Real index symbols (`^VIX`, `^GSPC`, `^IXIC`) return "Market data subscription required for CFD indices". `VIXY` tracks VIX **futures**, not VIX spot — the UI must not imply otherwise. |
| Sector/Peers | Sector: XLK, above. Peers: a **hardcoded map** (`PEERS` in `src/lib/symbols.ts`, Top-20 symbol → 2–4 peer tickers, populated by a one-time manual lookup) | Used inside Today's Story's Peers stat card and comparison section, not a standalone page. **Not a live Finnhub `/stock/peers` call** — this row used to imply one; the Today's Story build (see "Decisions that were explicitly reversed") replaced it with the hardcoded map so peer comparison costs no extra upstream call per cycle |
| SEC 8-K filings (structured metadata only) | SEC EDGAR per-company submissions endpoint (`data.sec.gov/submissions/CIK##########.json`), free, no API key | **Reverses the "never built, and not owed" row this used to be** — see the reversal note under "Decisions that were explicitly reversed" for why this is a different decision, not scope creep against the cut SEC Filings tab. `src/lib/sec-edgar.ts`; ticker→CIK map hardcoded in `CIK_BY_SYMBOL` (`src/lib/symbols.ts`), sourced once from SEC's public `company_tickers.json` mapping file. |
| AI summarization | Gemini `gemini-3.5-flash` (free tier) | Batched — see "AI call budget" below. **Not 2.5 Flash**, which returns 404 for new users; see the model reversal note below. |
| Company + Finnhub logos | Brandfetch Logo CDN (free to 500k req/month) | The one upstream the **browser** calls directly, and the only one that returns images rather than data. Hotlinked, never vendored — the licence caps caching at 30 days. See the logo note under "Decisions that were explicitly reversed". |

No paid tier anywhere. If a free-tier endpoint can't deliver something in this file, stop and flag it rather than substituting a paid one.

---

## Ingestion architecture — locked

**No client-triggered upstream API calls.** This is structural, not a preference, and it applies to every phase:

- Every external API call (Finnhub, Yahoo, Gemini) originates from a **scheduled server-side ingestion job**. Never from a page render, a component, a user interaction, or a page view.
- **Frontend pages read cached Supabase data only** — always through `src/lib/queries.ts`, never through an upstream client.
- **AI summaries are generated once per stock/data cycle and stored.** Never per visitor. Two visitors loading the same page cause zero AI calls between them.

How this is enforced:

| Mechanism | Where |
|---|---|
| Upstream clients isolated | `src/lib/finnhub.ts`, `src/lib/yahoo.ts` — only ever reached via an ingestion job |
| Ingestion behind a shared secret | `src/app/api/refresh/route.ts` checks `CRON_SECRET` and **fails closed** — a missing secret returns 503, never open access |
| Work skipped outside market hours | `isMarketOpen()` in `src/lib/market.ts`, evaluated in `America/New_York` so it survives EST/EDT |
| Schedules provisioned | `scripts/setup-cron.mts` (idempotent, re-runnable; reads secrets from `.env.local`, commits none) |
| Violations caught mechanically | `no-restricted-imports` in `eslint.config.mjs` — importing an upstream client from a page or component fails lint |

**One deliberate exception: company logos.** `src/lib/logos.ts` emits `cdn.brandfetch.io` URLs that the browser loads on every page view. This is outside the rule above rather than a violation of it, and the distinction is what the rule protects: metered quotas. Finnhub allows 60 calls/min and Gemini 20 requests/day, so page traffic reaching either would starve the ingestion jobs and there would be no way to buy more before a demo. Brandfetch's Logo CDN is a free static-asset host with a 500k requests/month allowance, returns images rather than data, and cannot exhaust anything the app depends on. It is also the only delivery method its licence permits — see the logo note under "Decisions that were explicitly reversed". Do not generalise this exception to anything that returns data.

A consequence worth knowing: adding a stock to the watchlist does **not** fetch anything. All 20 candidate symbols are ingested every cycle, so any stock the user can add already has cached data. Phase 4.5 extends the same reasoning to AI summaries — once each visitor keeps their own watchlist, every stock they *could* pick must already be summarised.

## Serving latency — measured from inside the deployed function

The read path was slow for reasons that had nothing to do with the queries themselves, and the two fixes below came from measurement rather than reasoning. Both reverse an earlier decision; don't undo them without re-measuring.

**What the measurement showed.** A query returning **one row** costs the same as one returning **840** — ~155ms either way, timed from inside the Vercel function. The price is per *request*, not per row or per byte, and Next.js itself contributes ~1–4ms (`handlerTotalMs` equalled `dbTotalMs` exactly). So page time was almost precisely *(number of queries that must run in sequence) × (per-request cost)*, and the fix is to attack those two numbers rather than to tune SQL.

This also means **reducing the count of queries that already run in parallel buys nothing.** Three concurrent copies of the same scan measured 0.34s against 0.28s for one. Query *depth* is what costs; query *count* mostly does not.

**Fix 1 — `vercel.json` pins functions to `sin1`.** They defaulted to `iad1` (US East) while the Supabase project sits in Asia, so every round trip crossed the Pacific. Measured per-request cost by region: `iad1` 260ms, `hnd1` (Tokyo) 225ms, **`sin1` (Singapore) 155ms**. Tokyo was tried on the theory that the database was there and was worse, which is what settled Singapore. Nothing else in the repo sets a region, so this file is the whole change.

**Fix 2 — the read helpers in `src/lib/queries.ts` are wrapped in `unstable_cache` at `CACHE_SECONDS` = 60.** Ingestion only writes every 15 minutes, so re-querying on every render was buying freshness that did not exist. `getTickers`, `getNews` and `getActivity` are cached; the watchlist arrives as an *argument* and so becomes part of the cache key, which is what keeps the Company and Industry tabs per-visitor.

Three traps here, all of which were hit:

- **`export const dynamic = "force-dynamic"` silently disables the data cache.** It implies `revalidate = 0`, so `unstable_cache` was a no-op while it was set and the pages re-queried on every render. It has been removed from Home, News and Today's Activity — they still render per request because `readWatchlist()` reads a cookie, and the build output still marks all three `ƒ (Dynamic)`. Check that marking if the setting is ever reinstated.
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

## Phase 6 — News Topics: IN DESIGN, NOTHING BUILT

**Read this first if you are picking work back up.** The owner and Claude are partway through a design interview (grilling session, started 2026-09-13) for a new AI feature. No code, schema or prompt has changed yet. Resume the interview from "Still open" below rather than starting to build.

**Why it exists.** The owner asked whether the app's AI use is really worth it, and the honest answer was: not much. The news call mostly paraphrases (for copyright), the Daily Summary's `movement` restates figures the stat cards already show, and `explanation` is the fixed fallback line on ~7 of 10 stocks. The AI Safety rules correctly forbid causation and prediction, which left the model only re-telling. This feature gives it a job that is useful *and* inside those rules: **organising** the day's news (Filter → Understand), never judging its effect on price.

**Decided:**

- **The term is `Topic`** — what an article is about (e.g. Earnings, Product). Never call it "category": `category` already means the company / industry / market split on the News page. See `CONTEXT.md`.
- **Scope of the first build:** one Topic label per article, plus a per-stock breakdown on Today's Activity that counts articles by Topic **in code**. The AI does **not** group articles into "stories" (same event, several outlets) in this build — that needs a stable story identity across cycles and days, and is deferred until labels prove useful.
- **Zero extra Gemini calls.** Topic is added as a field to the existing news-summary call's schema (`src/lib/news-ingest.ts`), so the budget stays 12/20 per day.

- **Placement: one card, not two.** The breakdown goes **inside the AI Daily Summary card, above the narrative** — the owner rejected a separate card as clutter. Bonus: that card currently reads "No summary for this session yet" all day until the close, and the breakdown fills it from the first news cycle. Three conditions agreed with it:
  1. **Each half states its own time** ("News by topic · updated 2:00 PM ET" / "Summary · written after the close") — they come from different jobs and must not read as one refresh.
  2. **The narrative's news part (`recap`) gets thinner in the same change**, or the card tells the day's news twice. How thin is still open.
  3. **The breakdown is bounded in size** so the card does not push the chart off an iPad or phone screen.
- **The card counts "12 articles in 3 Topics", never "3 stories"** — no story grouping exists in this build. **A row's text is the newest headline in that Topic**, not an AI gist of the group; nothing produces a per-group gist without another call.

**Still open (ask these next, in this order):**

1. *(settled — see Placement above)*
2. The fixed Topic set. Draft: Earnings · Product · Deal · Regulatory & Legal · Analyst View · Market Wrap · Other. `Analyst View` stays separate because it is the one Topic whose content is opinion.
3. Passing mentions: per article (fold into `Market Wrap`) vs per article × symbol. Claude recommended per article.
4. ~1,400 already-summarised articles have no Topic, and `selectForSummary` never re-sends a summarised article. Recommended: no backfill run; spare slots in each cycle's 25-article batch label old articles, and the breakdown shows an explicit "n not yet labelled" count rather than silently undercounting.
5. Report tone/sentiment: recommended **not** to build — beside a price chart it reads as causation.
6. After those: the per-row text on the card, a Topic filter on the News page, schema/migration, prompt wording.

**Do not re-derive:** there is no numeric "importance/impact score" in this design, for the same reason the Confidence Score was cut — an LLM grading itself is a weak signal; a Topic label is checkable by reading the article.

---

## Phase 4.5 — agreed scope change, BUILT except the logos

**Read this before trusting anything below it.** Changes 1–4 below are **in the code and verified**; change 5 (logos) is **not built** and is blocked — see the work order. Where this section contradicts a statement further down this file, this section is the newer decision and wins — the older text is left in place deliberately so the reasoning that produced it is still readable.

Branch at the time of the decision: `phase-4-todays-activity`, last commit `86cb848`, working tree clean.

### What changes, and why

**1. Daily summaries cover all 20 stocks, not the 10 on the watchlist.** 20 ÷ `BATCH_SIZE` 5 = 4 batches = **4 Gemini calls/day** (was 2). This follows directly from change 2: once each visitor has their own watchlist, the server cannot know at generation time which stocks anyone will ask for, so every stock a visitor *could* pick must already have a summary. That is the same principle the ingestion architecture already runs on — all 20 symbols are ingested every cycle so that adding a stock fetches nothing.

- Source of the symbol list moves from the `watchlist` table to `TOP_20_SYMBOLS` in `generateDailySummaries` (`src/lib/daily-summary.ts`).
- The cron schedule does **not** change. `5-55/10 21-22 * * 1-5` gives 12 ticks; 4 are used, 8 remain as retry headroom. *(Superseded: the window is now `5-55/10 22-23 * * 1-5`, still 12 ticks — moved so the last news cycle lands a full hour first. See Phase 5 item 2.)*

**2. The watchlist becomes per-browser, stored in a cookie.** Today it is one global Postgres table, so any visitor editing it edits it for everyone. The owner wants each visitor to keep their own selection.

- **Cookie, not `localStorage`** — this was decided against `localStorage` on purpose. Home and News are server components that need the watchlist *at render time*: a cookie is sent with every request and readable via `cookies()`, `localStorage` is not. With `localStorage` the watchlist table and the News page both have to become client components that fetch all 20 and filter after hydration, which adds a first-paint flash, and the cap can then only be enforced client-side — which is exactly the failure recorded under Resolved items, where the read path and the API counted different lists and let the cap reach 11.
- **Cookies are not shared between visitors** — this came up in planning and is worth recording so it isn't re-asked. A cookie lives in each visitor's own browser, exactly like `localStorage`; the thing that is shared today is the Postgres table. Neither mechanism separates two people using the same browser profile — only accounts would, and accounts are ruled out.
- Sizes: **default 7 stocks, minimum 1, maximum 10.** The minimum is new — `DELETE` must refuse to remove the last symbol. The default was set to 7 rather than 5 so Company News is not too thin on a first visit.
- Cap enforcement **stays server-side**, now over the cookie rather than table rows. `readWatchlist()` re-validates on every read: drop anything outside the Top 20, drop duplicates, clamp to 10, fall back to the default when the cookie is missing or ends up empty — a hand-edited cookie must not be able to break a page.
- Built in `src/lib/watchlist.ts` (cookie read + the min/max/default constants), replacing `getWatchlistSymbols()` in `src/lib/queries.ts`. Three call sites read it: `src/app/page.tsx`, `src/app/todays-activity/page.tsx`, `src/app/todays-activity/[symbol]/page.tsx`.
- **`next/headers` is imported dynamically inside `readWatchlist()`**, not at the top of the file. The `next` package declares no `exports` map, so plain Node cannot resolve its subpaths, and a top-level import makes the whole module — constants and normalisation rules included — unloadable in the test runner. Do not "tidy" it back into a static import without also solving that.
- The `watchlist` table now has no readers. Left in place; drop it in a later migration, not as part of this change.

**3. News categories move from ingest time to query time.** This is forced by change 2 and is easy to miss. `src/lib/news-ingest.ts` currently reads the global watchlist, splits the Top 20 into watched/industry, and **writes `category` into the row permanently**; `getNews` then filters on that stored column. With a per-visitor watchlist that stored value describes nobody. The `news` table already stores `related_symbols`, so the split is derived per request instead:

- `company` → `related_symbols` overlaps the visitor's watchlist
- `industry` → a per-symbol article that does not overlap it
- `market` → the general feed, which carries no tickers and is unaffected

Consequences worth stating: Company + Industry together are always the whole Top 20, so no article disappears when the watchlist changes; a change takes effect immediately without re-ingesting, because all 20 symbols' articles are already stored; and an article tagged with several companies lands in Company as soon as any one of them is on the watchlist. **This does not change how many Finnhub calls ingestion makes** — it already fetches watched + industry = all 20, and now fetches them as one list rather than two labelled passes.

Built in `src/lib/news-category.ts` (`categoriseNews`, with tests) plus migration `0006`; the tab filters run in Postgres so `limit` still counts articles the tab will actually show. **`market` is identified by an empty `related_symbols`, not by the old stored column** — measured across the whole table before relying on it: 19 of 19 general-feed rows carried no tickers and 116 of 116 per-symbol rows carried at least one.

**4. Today's Activity gets watchlist editing in the header dropdown.** The switcher (`src/components/symbol-switcher.tsx`) grows two groups: the watchlist stocks each with a `−` to remove, and the remaining Top 20 stocks each with a `+` to add. `−` is unavailable at 1 stock, `+` at 10, and the 409 the API already returns for a full watchlist must be surfaced in the menu rather than swallowed. Mutations call `router.refresh()` so the server re-renders against the new cookie. Removing the stock currently being viewed is allowed and does not redirect — the page reads `price_cache`, which holds all 20, so it keeps working and the stock simply moves into the "add" group.

**5. Market News thumbnails use the Finnhub logo**, and **all company logos are re-sourced from Brandfetch** (see the logo note under "Decisions that were explicitly reversed").

### The bug this change would have introduced if built naively — fixed

`generateDailySummaries` rebuilt every active stock's timeline **before** reaching the Gemini call, sequentially — `loadDayData` is 2 Supabase queries per symbol inside a `for` loop. At 10 symbols that is 20 queries; at 20 it is 40. The call is only attempted if at least `MIN_CALL_BUDGET_MS` (15s) remains of `JOB_BUDGET_MS` (55s). If the preamble grew past ~40s, **every tick would spend its whole budget on timelines, never place a call, and the day would end with no summaries at all** — failing identically on every retry, so the spare ticks would not save it.

Fixed, though **not by the concurrency this file used to describe** — the wording here named a `mapLimit` pool at `TIMELINE_CONCURRENCY` 5, and neither exists in the code. The fix that actually shipped is better: `loadDayDataBatch` (`src/lib/day-data.ts`) reads every symbol's snapshots and news in **one batched pass**, so the I/O is a fixed two round trips no matter how many stocks are covered, rather than two per symbol run through a worker pool. What remains after that read is pure arithmetic, so the rebuild loop is a plain sequential pass with no reason to be concurrent. The loop still stops once `TIMELINE_DEADLINE_MS` (25s) of the run has elapsed. Two details worth keeping:

- **The current batch is exempt from the deadline and is processed first.** `loadDayData` produces both the timeline *and* the call's input, so dropping it for a batch symbol would silently cost that stock its summary. Only rebuilds nobody is waiting on get abandoned.
- **`preambleMs` and `timelinesSkipped` are in the job's response**, so a slow run can be attributed without guessing.

Measured on the first 20-stock run: **preamble 6,966ms** for all 20 timelines, `timelinesSkipped` empty, leaving ~48s for a call that took 11.8s. The deadline exists for the case where Supabase is slow, not for the normal one.

Rebuilding every stock's timeline on every run is deliberate and was kept — it is free of AI and upstream calls, which is what lets a rule change be rolled out by re-running the job.

### Work order — all six done

1. ✅ Cookie watchlist (change 2 + 3) — Home, News and Today's Activity all render; a hand-edited cookie (junk, duplicates, 15 symbols, empty) normalises correctly on every one.
2. ✅ Dropdown `+`/`−` and the Home picker (change 4) — both boundaries verified in the browser: at 1 stock every `−` is disabled, at 10 every `+` is; the 409 renders in the menu; removing the viewed stock does not redirect.
3. ✅ Timeline preamble fix — see above.
4. ✅ Switch the job to all 20 (change 1) — one run, `stale: []`, all 20 timelines, `geminiCalls: 1`. **Note the original wording of this step was wrong:** one invocation summarises one `BATCH_SIZE` batch, so it reports **1** call, not 4. Four *runs* cover the Top 20; that is what "4 calls/day" means.
5. ✅ Logos (change 5) — all 20 marks plus Finnhub now come from Brandfetch, **hotlinked from its Logo CDN rather than vendored**, because reading the licence forced that change. See the logo note under "Decisions that were explicitly reversed". All 21 marks were confirmed 200 in a browser **against `fallback/404`** — the first pass used `fallback/transparent`, under which a wrong domain also answers 200 with a blank image, so that check had proved nothing. A deliberately bogus domain was included as a control and did 404.
6. ✅ This file updated; `npm test`, `npx tsc --noEmit`, `npm run lint` all clean.

**Quota discipline while testing:** one summary run costs 1 of the 20 daily requests, and a full day's coverage costs 4. Building 1–5 above spent exactly **1** call in total, by verifying the preamble fix and the widening in the same run — the run rebuilds all 20 timelines regardless of batch size, so a separate 10-stock check was unnecessary. Its 5 summary rows were deleted afterwards because the market was still open and they described an unfinished session.

### Findings from this planning session (don't re-derive these)

- **`news.source_url` is not the publisher's URL.** Measured against the live table, 135 rows: company 72/72 and industry 44/44 are `finnhub.io` redirect links; market is 17/19 `news.google.com` and 2/19 `cnbc.com`. Deriving a publisher name from the hostname yields "finnhub.io" and "news.google.com" and is worthless. `src/lib/finnhub-news.ts` also drops Finnhub's `source` field — `FinnhubArticle` never declares it — so the publisher name is not stored anywhere either. This is why per-publisher thumbnails were abandoned rather than built.
- **thesvg has almost no news publishers.** Reuters and Google News exist; Bloomberg, CNBC, Yahoo Finance, MarketWatch and Seeking Alpha do not. Its whole "News" category holds 3 icons — it is a tech-brand library.
- **The current market-news icon is a rising arrow** (`ICONS.market` in `src/components/news-thumbnail.tsx`). On a market-selloff article it asserts a direction the article contradicts, which sits badly beside a product whose AI is forbidden from implying direction. Whatever replaces it should be direction-neutral.
- **The thumbnail plate is 176×80 (2.2:1) and the glyph inside it is a 28px square.** The mark does not read as missing because it is absent; it reads as missing because it occupies about a tenth of the plate.

---

## Execution plan — 5 phases, work in order

Each phase ends on a **gate**: a demo the project owner reviews before you continue. Don't start the next phase until the current gate's criteria are met and the owner has confirmed. If a criterion fails, fix it — don't move on and come back later.

Deadline: **20 days from the day work starts** (Day 1 = whatever day the owner kicks this off), all days count including weekends. Don't anchor to a specific calendar date in this file — track elapsed days from the actual start instead.

| Phase | Days | Gate | Status |
|---|---|---|---|
| 1. Foundation | Day 1–3 | Day 3 | **Done** — gate criteria verified |
| 2. Home page | Day 4–7 | Day 7 | **Done** — gate criteria verified |
| 3. News pipeline | Day 8–12 | Day 12 — **hard cutoff, see Cut Order below** | **Done** — no cuts taken; all 4 tabs shipped |
| 4. Today's Activity | Day 13–16 | Day 16 | **Built.** Batched summaries ratified by the owner. A scope change is agreed but unbuilt — see Phase 4.5 above |
| 5. Automation, polish, deploy | Day 17–20 | Day 20 — final deadline | Scheduler pulled forward — see note. Phase 4.5 lands first |

**Phase 5's scheduler work was pulled forward into Phase 2–3.** The "no client-triggered upstream API calls" rule means there is no compliant way to refresh data without a scheduler, so ingestion scheduling had to exist before the news pipeline, not after it. Phase 5 keeps the news/EOD schedules, visual pass, outage test, and final deploy.

Live URL: **https://ustechmarket.vercel.app** (Vercel deployment protection disabled so it is publicly reachable).

**That URL deploys from `main`, not from the working branch.** Worth stating because it silently misleads: Phase 4 and 4.5 were built and committed on `phase-4-todays-activity` and pushing them left the live site on Phase 3 for the whole time — `/todays-activity/*` returned 404 there while working locally. A branch push produces at most a preview deployment on some other URL. Merge to `main` before treating anything as live, and check a route the branch added rather than just the home page, which returns 200 either way.

### Phase 1 — Foundation (Day 1–3)

1. Scaffold Next.js, create Supabase project, obtain and test a Finnhub API key against one real stock.
   - **Done when**: `npm run dev` runs, and a real JSON price response for one stock has been printed/logged.
2. Design and migrate the DB schema. It must cover: watchlist, price cache, **intraday price snapshots** (see below), news, AI summaries, events.
   - **Done when**: migration runs clean and a `SELECT` succeeds against every table.
3. Build the sidebar shell (Home / News / Today's Activity) and deploy an empty version to Vercel.
   - **Done when**: a public Vercel URL loads and all three nav items route correctly, even with no real data yet.

**Intraday snapshot table — build this now, not later.** It's the backing data for two features that land in later phases (Home page sparklines, Today's Activity timeline). Store a price/volume snapshot roughly every 15–30 minutes during market hours. Design it once here so Phase 2 and Phase 4 both read from it instead of inventing their own storage.

### Phase 2 — Home page (Day 4–7)

This page's content contract — what must be present, not how it looks. Visual design (layout, color, spacing, theme) is owned by Claude Design and consumed as a reference, not specified here — build against this checklist regardless of which design pass you're implementing against:

1. **Market Overview — 5 cards**: NASDAQ, S&P 500, Dow Jones, Technology Sector, VIX. Each card: current level, absolute + % change, a sparkline (reads from the intraday snapshot table), market-open/closed indicator.
2. **My Watchlist table** — 8 columns exactly: `Symbol, Price, Change, Change %, Volume, Rel. Volume, Status, Chart (Day)`. `Status` is the Significant/Normal badge (rule below). `Chart (Day)` is a sparkline. Use **real company logos** (see Logo sourcing below) — this was explicitly reversed from "generic badge only" because it's a demo, not a shipped product.
3. **Top Movers Today** — Top 5, ranked by the same significance scoring rule as the Status badge (below), computed across the **full Top-20 list**, not just the watchlist. Tabs for Top Gainers / Top Losers / Most Active are fine to include if trivial, but not required.
4. **Market News teaser** — 3 articles. Reuse the same ranked list that powers "Top News by Impact" on the News page — do not compute a separate ranking here.
5. **Watchlist picker** (Top 20 → pick up to 10): add/remove, hard cap enforced at 10, block attempts to add an 11th with a clear message. *(Phase 4.5: the store becomes a per-browser cookie, the default becomes 7, and a minimum of 1 is added — removing the last stock must be blocked the same way adding an 11th is.)*

No AI Daily Insight card on this page — cut. Home page has zero AI calls; the only two AI touchpoints in the whole app are the News summarization batches and the per-stock Today's Activity summaries (Phase 3 and Phase 4).

**Significant Movement rule** — the one formula used everywhere (Status badge, Top Movers, Today's Activity badge). Don't reimplement it per page; write it once and import it:

```
IF |price change| ≥ 5%                              → Significant
IF relative volume ≥ 2.5x                            → Significant
IF |price change| ≥ 3% AND relative volume ≥ 1.5x    → Significant
ELSE                                                  → Normal
```

**Logo sourcing** — do not scrape logos from arbitrary web pages (adds a second copyright surface). Use one of: (a) an official investor-relations brand asset page, or (b) a free-to-use icon library such as Simple Icons. Record which source you used, **and record what its licence actually permits** — the source and the delivery method are separate questions, and Phase 4.5 found a source whose licence allowed hotlinking but not the vendoring that had already been designed around it. *(Settled: the source is now Brandfetch's Logo CDN, hotlinked — see "Decisions that were explicitly reversed".)*

**Done when**: Home page shows real Finnhub data for at least 3 stocks, watchlist add/remove works with the 10-cap enforced, and badges are correct against at least 3 hand-picked edge cases (one of each trigger condition). No AI call happens on this page at all — if you find yourself adding one, stop, that's scope creep against a locked decision.

### Phase 3 — News pipeline (Day 8–12) — highest-risk phase, hard cutoff applies

1. Fetch and cache news from Finnhub, dedup so the same article never appears twice in the DB.
2. **Batched AI summarization**: one Gemini call per fetch cycle covering all new articles together — never one call per article. The 2–3 line summary shown per article **must be AI-generated paraphrase**, never Finnhub's raw snippet/headline field pasted directly (copyright risk). The prompt must also enforce the AI Safety / Data Integrity Rules below (no invented facts, no causal claims beyond what the source states, no predictions).
3. Build the News page: 4 tabs — `All News` (default) / `Company News` / `Industry News` / `Market News`. No sort dropdown, no list/grid toggle — one fixed "latest first" list view.
4. **Thumbnails are logos, never article photography.** Chain, in order: company logo → ticker lettermark (companies with no freely-licensed mark) → category icon (market news, which belongs to no single company). Finnhub's `image` field is deliberately unused: it supplies an image for nearly every article, but there were only **10 distinct URLs across 90 articles** — 69 sharing one Yahoo Finance placeholder and 13 the Reuters publisher logo — so the page rendered the same two pictures over and over. Dropping remote images also removes the need for an `onError` handler, which is why `news-thumbnail.tsx` is a server component with no client JavaScript.
5. **Related Stock tags**: use the ticker field Finnhub already attaches to each article — don't have the AI infer which stocks an article relates to.
6. No bookmarking feature — there's no auth/user system to attach it to, so it's out of scope entirely, not deferred.

**Cut order if Day 12 arrives and this phase isn't done** — this was pre-agreed specifically so no one has to make this call under deadline pressure. Cut in this order, stop as soon as it's shippable, do not ask the owner again:
1. Drop the "Top News by Impact" ranking panel.
2. Collapse 4 category tabs into 2.
3. Drop any remaining UI filters.
4. **Never cut**: batched AI summarization itself, or the source-link-back to the original article (the copyright mitigation depends on both).

Deadline does not move. Scope does.

**Done when**: fetching once produces zero duplicate articles, a 5-article batch produces exactly one Gemini call (verify in logs, don't assume), category filtering works, and clicking a source link opens the real article.

### Phase 4 — Today's Activity (Day 13–16)

This is a single page per stock at `/todays-activity/[symbol]`, reached only through the shell nav (a left rail then, the top card now) — **no secondary tab bar** (Overview/News/Events/Financials/Charts/Peers/SEC Filings from early mockups were all cut; don't build them).

Layout:
1. **Header**: ticker only (`NVDA`, not "NVIDIA Corporation") which doubles as a button opening a dropdown of the watchlist stocks; selecting one navigates to that stock's route. *(Phase 4.5 adds `+`/`−` controls to this dropdown so the watchlist can be edited without leaving the page.)*
2. **7 stat cards**: Price Movement, Trading Activity (relative volume), Sector Performance, Market Performance, Peers, Period Performance, News & Events count. All reuse data already fetched elsewhere — no new fetches. *(Widened from 5 to 7 by the Today's Story build — see "Today's Story replaces the AI Daily Summary" under "Decisions that were explicitly reversed" below. Peers reads the hardcoded `PEERS` map in `src/lib/symbols.ts`, not a live Finnhub peers call — see the Data Sources table.)*
3. **Significant Movement badge** — same shared rule from Phase 2, same import.
3.5. **AI Daily Summary ("What Happened Today")** — a Gemini-written card, rendered after the Timeline, ahead of Today's Story. Retired as superseded by Today's Story, then **reinstated 2026-09-26**, initially titled "Worth Your Attention Today" and placed right after the stat cards — both since reversed the same day: the heading swapped with Today's Story's own headline section (now titled "Worth Your Attention Today" instead), and the card moved down to sit after the Timeline. See "Today's Story replaces the AI Daily Summary" under "Decisions that were explicitly reversed" for the full history. `src/components/daily-summary-card.tsx`, read via `Activity.dailySummary` in `queries.ts`.
4. **Today's Story** — this is the core of the page. It replaced the original 3-field "AI Daily Summary" (narrative + bullets) with an ordered narrative covering price, volume, peer/sector/market comparison, historical unusualness, a causal explanation, fundamentals, and a year-to-date takeaway — see "Today's Story replaces the AI Daily Summary" below for what changed and why, including the one AI Safety rule it deliberately loosens. **No longer displayed under one "Today's Story" umbrella heading** — each part renders as its own top-level page section (see the later reversal note on this), though the page is still served at `/todays-activity/[symbol]` and reached via the nav item and keyboard shortcut both labeled "Today's Story" — only the on-page text changed, not the route, file names, or shortcut. Because of the narrative's widened scope, every section is fed structured data (exact numbers, not prose) and instructed not to compute or restate numbers on its own — the wider the coverage, the more a small hallucination compounds. There is no separate "Top News" or "Related Stocks" section — that content lives inside the headline and comparison sections now. This is the highest-stakes prompt in the app for the AI Safety / Data Integrity Rules below.
5. **Price & Volume intraday chart** — reads from the same intraday snapshot table as everything else.
6. **Timeline** (on-page heading; was "Today's Timeline" — see the reversal note under "Decisions that were explicitly reversed") — rebuilt from the stored intraday snapshots and news on **every `intraday-snapshots` tick** (so roughly every 15 minutes during the session), and once more by the end-of-day job. Timeline events (market open, notable news, high-volume alert, price milestone, market close) are computed with simple threshold rules, not AI. **Reversed — this said "reconstructed once, during the end-of-day batch job" and forbade any intraday rebuild; see the reversal note below for why that was wrong and what the boundary actually is.** Every article of the day gets a row: there is no cap, so this agrees with the News & Events stat card above it.
7. **Upcoming Events** — earnings date + earnings call only, from Finnhub's calendar. Do not invent a conference/event calendar (no free API covers it, and hand-entering events isn't "AI-powered" and doesn't scale).

No Confidence Score. It was considered and cut — the natural version of it would be an LLM self-reporting its own confidence, which is a weak signal in practice; the 5-bullet reasoning already in the summary carries that job.

**Done when**: switching stocks via the header dropdown routes correctly for all 10 watchlist stocks, Today's Story for 3 spot-checked stocks matches the underlying raw numbers exactly (read it yourself — don't trust that it's "probably fine"), and the timeline renders from stored snapshots with no live polling involved.

### Phase 5 — Automation, polish, deploy (Day 17–20)

The end-of-day summary schedule was provisioned in Phase 4, not here: `daily-summaries`, `5-55/10 22-23 * * 1-5` → `/api/daily-summary`. It runs a full hour after the 21:00 UTC news cycle (which has to land first so the day's articles exist before they are summarised) and the handler refuses to run while the market is still open, evaluated in `America/New_York`. Each run summarises the next batch of stocks that still lack a summary, so the extra runs are how a timeout or a 503 gets retried.

1. Supabase Cron: news fetch 8x/day, `0 7,10,12,15,18,20,21,2 * * *` UTC (the handler has no market-hours gate, so the fixed UTC hours simply shift by one at each DST changeover — the owner is in Thailand/ICT, so local time is never the reference). Plus the end-of-day Today's Activity generation job, timed to run after US market close.
   - Schedules are added to `scripts/setup-cron.mts` alongside the intraday snapshot job, not to `vercel.json`.
   - **DST is handled in code, not in the cron expression**: schedule across a UTC window wide enough to cover both EST and EDT, then let the handler decide using `America/New_York` time. A fixed UTC cron expression silently drifts by an hour twice a year.
   - **Done when**: a manual trigger of each job succeeds; don't wait on a live cron firing to find out it's broken.
   - Verify the real outcome in `net._http_response`, **not** `cron.job_run_details` — `pg_net` is fire-and-forget and reports success as soon as the request is queued, so a job shows green even when the endpoint returned 401 or timed out.
2. EOD job depends on all news for the day being fetched first — sequence the last news cycle to complete before the EOD summary job starts.

   **This requirement was written down here and then not met in practice, for two separate reasons.** Worth recording because the schedule looked correct and the failure was silent. First, `daily-summaries` began at 21:05 UTC, five minutes after the 21:00 UTC news cycle — nominally "after", but no real clearance. Second and much worse, only three of the four news cycles ran before the summary window at all (the 01:00 UTC one ran after every tick), and the cycle cap meant those three could store at most 45 articles against a day that produced ~90. Measured on ET day 2026-08-14: **55% of the day's articles were not yet in the database when the summaries were written**, and six stocks were told "no news" on a day they all had some.

   Now met by both halves: 6 news cycles with five before the window, and the window itself moved to `5-55/10 22-23 * * 1-5` so the last cycle (21:00 UTC) has a full hour of clearance. (A seventh and eighth cycle were added later, at 07:00 and 10:00 UTC, for an unrelated reason — see the AI call budget. They do not change this sequencing, since both land long before the window like the rest.) See "The news pipeline dropped most of the day's articles" below for the storage half of the fix, which is the part that actually mattered.
3. Implement whatever visual design Claude Design has produced by this point; responsive check across the three pages. **Done for laptop, iPad and phone.** *(This said "Phone is deliberately out of scope" through two revisions — first because the owner named laptop and iPad, then because phone merely stopped overflowing. The owner has since made it a target and the composition is built; see "Phone is a designed width now" below. Everything under it that still calls phone a non-target is superseded.)*

   **The whole page was 1,221px wide regardless of viewport, and one missing class was the cause.** `<main>` in `src/app/layout.tsx` is a flex item, which defaults to `min-width: auto`, so it could not shrink below its content's min-content width — the 880px watchlist table plus padding, plus the 240px sidebar. The two `overflow-x-auto` wrappers that already existed (`watchlist-table.tsx:46`, `intraday-chart.tsx:73`) were therefore dead code: instead of scrolling inside themselves, they pushed the page sideways. Adding `min-w-0` to `<main>` is the entire fix, and it makes those wrappers behave as designed — measured at 1100px, the table wrapper is 778px wide holding an 880px table and scrolls internally.

   **The symptom this produced was iPad-only, which is why it went unnoticed.** A laptop viewport exceeds 1,221px so the page always fitted; every iPad is narrower, so Safari laid the page out wider than the screen and it had to be zoomed out before it was usable. Measured before (simulated by forcing `min-width: auto` back on) and after:

   | width | before | after |
   |---|---|---|
   | 768 (iPad portrait) | 1189 — overflows | 768 — fits |
   | 834 (iPad Air / Pro 11") | 1189 — overflows | 834 — fits |
   | 1024 (iPad landscape) | 1221 — overflows | 1024 — fits |

   The 768/834 figure is 1189 rather than 1221 because the `lg:` breakpoint at 1024px has not engaged, so the Top Movers / News teaser grid is still one column. All three pages are clean at every width above.

   Two things ruled out by measurement, so don't re-investigate them: **the viewport meta tag is present and correct** (`width=device-width, initial-scale=1`, injected by Next) — it was the obvious suspect and it was innocent; and **the sidebar needed no breakpoint for iPad** — `w-60 shrink-0` cost 240 of 768, which was tight but not the cause of anything.

   **At 390px (phone) all three pages overflowed**, because content inside `main` had its own minimums below which nothing could shrink. It was left unfixed on purpose — the owner demos on a laptop and wants iPad to work, and fixing phone meant giving the sidebar a collapse behaviour, which is a visual-design decision rather than a bug fix.

   **That is now fixed, as a side effect of moving navigation out of the rail.** See the entry below.

### The sidebar became a card across the top

   **`src/components/sidebar.tsx` is gone; `src/components/top-bar.tsx` replaces it**, and `src/app/layout.tsx` stacks the shell group as a column instead of a row. The card holds the product name at the left, then the same three nav items — same authored glyphs, same `nav-active` recipe, same `aria-current`, same `aria-keyshortcuts`, same 44px touch height. It uses the **same `panel-rail` material**, which keeps its name: that tier was always defined by the role (shell, recessive relative to content, the sanctioned exception to the Climbing Ramp Rule) rather than by the axis, so every contrast figure measured against it still holds.

   **It is deliberately not sticky**, which reverses the rail's behaviour rather than forgetting it. A rail can be sticky for free because content scrolls past its *side*, so its backdrop holds nothing but the fixed sky and the 10px blur is never recomputed. A pinned top card has content passing *underneath*, which re-composites that blur on every scroll frame — the case DESIGN.md's Bounded Motion Rule exists to forbid. `g h` / `g n` / `g a` cover switching from any scroll position.

   **The content column went from `viewport − 48 − 240 rail − 24 gap` to `viewport − 48`, so every shell-derived breakpoint moved.** All four were recomputed and each carries its new arithmetic in a comment at the call site:

   | Where | was | now | arithmetic |
   |---|---|---|---|
   | `watchlist-table.tsx` scroll hint | `min-[1060px]` | `min-[800px]` | 748 table + 48 shell = 796, rounded up |
   | `intraday-chart.tsx` scroll hint | `min-[888px]` | `min-[650px]` | 560 plot + 40 panel + 48 shell = 648 |
   | `page.tsx` Home grid | `min-[1390px]` | `min-[1130px]` | 748 + 24 gap + 300 + 48 shell = 1120, rounded up |
   | `loading.tsx` skeleton grid | `min-[1390px]` | `min-[1130px]` | mirrors the above |

   Two consequences worth knowing. **Home is two-column at 1280 now** — it was stacked there, because 1390 was above a common laptop width — so the owner's own screen gets the composition the page was drawn for. And **`main` measures 1422px at a 1470px viewport where it measured 1158px**: content gained exactly the 264px the rail was spending.

   **All three routes now fit at every width measured — 390 / 430 / 600 / 768 / 834 / 1024 / 1130 / 1280 / 1470 / 1920** — with `documentElement.scrollWidth` equal to the viewport at each. Measured with the iframe method below, not eyeballed. Phone is still not a *designed* target (nothing under 600px has been composed for, and the nav card wraps to two rows of items there, 110px instead of 62px), but it no longer overflows. *(Superseded — it is composed for now; see "Phone is a designed width now" below.)*

   **The cost, stated plainly:** 84px of permanent vertical chrome on every route (62px card + 24px gap, below a 24px viewport margin) where a left rail charged none. Vertical space is the scarcer axis on a laptop; this was accepted, not overlooked.

   **One measurement trap, hit twice.** Inside a freshly created iframe, React streams the page into a **classless `display:none` div that is the first child of `<body>`**, then moves it. Query too early and `querySelector('table')` returns the staged copy, whose every `getBoundingClientRect()` is 0 — which reads exactly like a layout collapse. Poll until the element has non-zero width before believing any number from it. *(This used to add that the "opens the live URL on a phone" wording in **Done when** below was stale because the owner had narrowed that target. The target was widened again and phone has since been composed for, so that wording stands as written — the trap above is the only part of this paragraph still worth reading.)*

### Phone is a designed width now

   **The owner reversed the non-target.** Phone stopped overflowing as a side effect of moving navigation out of the rail, and that was recorded honestly at the time as a side effect rather than as work — nothing below 600px had been composed for. It has been now, so laptop, iPad and phone are three designed widths rather than two plus a width that merely fits.

   **The watchlist is the reason the pass exists, and "it scrolls" was not good enough.** 746px of min-content inside a 358px column shows Symbol and Price and puts **Change % — the one number the page exists to report — behind a horizontal scrollbar that iOS and iPadOS both hide until a scroll is already under way.** The Scrolling Island Rule kept that from breaking the page and was doing its job; what a scroll container cannot do is make the primary read reachable. Below 600px each stock is now two lines carrying all eight fields, built from **the same format helpers as the table cells** so the two presentations cannot disagree about a number. It is a list on the existing panel, not seven cards: these rows are one repeated measurement, and a pane inside a pane would break the One Translucent Layer Rule as well as reading as seven objects.

   **The shell takes a phone tier at 600px** — 16px of gutter and gap rather than 24. That is not a page reclaiming its own margins; it is one more value in the single place that sets them, at a breakpoint the product already had (it is where the nameplate hides). 24px is 12.3% of a 390px screen spent on emptiness on the axis a phone has least of, and dropping it returns 16px to the content column (342 → 358). **That 16px is what buys the two fixes above it**: the nav card holds its three items on one row again (110px of chrome back to 62px, with "Today's Activity" shown as "Activity" below 600 via a hidden prefix, so the accessible name on a laptop is still the full label), and a watchlist row carries a badge and a sparkline on the same line.

   **The two five-card grids go two-up rather than stacking.** Market Overview ran ~810px stacked — two full screens before a visitor reaches their own stocks — against ~420 paired. It fits by measurement: a card is (358 − 12) / 2 = 173px, 141px inside its padding, against a ~108px figure. **The `text-figure` step itself is untouched** — forking one shared step by width is how the same role ended up at two sizes before that step existed.

   Measured clean at 390 / 430 / 600 / 768 / 834 / 1024 / 1130 / 1280 / 1470 / 1920, `scrollWidth === innerWidth` on all three routes, by the iframe method below.

   **Testing note: `resize_window` does not work in this environment** — it reports success while `innerWidth` stays put and `outerWidth` reads 0. Every width above was measured by injecting a same-origin `<iframe>` of the target size into a page already on `localhost:3000` and reading `contentDocument.documentElement.scrollWidth` — media queries evaluate against the iframe's own viewport, so this is a real responsive test rather than a simulated one.
4. End-to-end test: simulate a Finnhub outage/rate-limit and confirm the app shows a fallback/error state instead of crashing. **Done** — run against a local production build, results below.

   **A Finnhub outage cannot reach a page at all, and that is the point of the ingestion rule.** Simulated by starting `next start` with `FINNHUB_API_KEY` overridden to a bogus value, so every `/quote` answers 401 — the same `!res.ok` throw that a 429 or a 500 takes, so one probe covers rate-limit and outage alike. `POST /api/refresh?force=1` returned **HTTP 200** with `symbols: 25, prices: 0, snapshots: 0, failed: [all 25]`. The important half is what did *not* happen: `price_cache` still held 25 rows with an unchanged newest `updated_at`, and `intraday_snapshots` still held 1,346 rows. A total upstream failure writes nothing rather than overwriting good data with nulls, and the job reports which symbols failed instead of throwing. Home, News (All + Company) and `/todays-activity/NVDA` all returned 200 with the real cached prices still rendered.

   Two consequences worth stating. A failed refresh is **safe to run locally** despite sharing the production database, because nothing is written. And a *partial* outage is the same path — the surviving symbols upsert normally and only the failures land in `failed`, since the try/catch in `refreshMarketData` is per symbol.

   **`src/app/error.tsx` is the fallback for a render that throws**, and it catches less than it appears to — both halves measured, not assumed:

   - **An upstream outage never reaches it.** Pages read cached tables only, and the ingestion job absorbs a Finnhub failure per symbol.
   - **A failed database read now does reach it, and that is the fix for a reported bug.** This line used to read "a Supabase query error surfaces as `{ data: null }` rather than a throw, so the components' own empty states handle it" — stated as a property of the design. It was the defect. See "A transient read was cached as 'no data'" below.
   - **`src/components/session-marker.tsx` is the one deliberate exemption**, because it renders from the root layout, which is above this boundary.
   - **A throw during module evaluation never reaches it either.** Starting the server with `SUPABASE_SECRET_KEY` blank makes `createClient` throw on import of `src/lib/supabase.ts`, before the React tree exists: all three routes returned a bare `Internal Server Error` text body, no boundary, no sidebar. **This is a known uncovered case.** Making it catchable means constructing the client lazily, which touches every `db.from(...)` call site — not worth it for a misconfiguration that breaks the whole site anyway, but do not claim the boundary covers it.
   - **What it does catch is a render-time throw**, whose reachable cause is a malformed timestamp: `Intl.DateTimeFormat` rejects an Invalid Date, so every helper in `src/lib/format.ts` taking an ISO string can raise a `RangeError` on a row in the wrong shape. Verified by temporarily throwing a `RangeError` in `src/app/page.tsx` (reverted): Home served 500 rendering the boundary **inside the layout** — sidebar intact, clicking News from it navigated normally — with the digest shown and the error message not leaked. `/news` and `/todays-activity/NVDA` were unaffected, so the failure is scoped to the route that threw.

   **The boundary renders on the client after hydration**, so `curl` proves nothing: the SSR shell is `<html id="__next_error__">` with the body `Internal Server Error`. Two rounds of checking were spent before this was noticed — verify it in a real browser.

   - ✅ **The logos load from the deployed origin.** Checked on `ustechmarket.vercel.app` after the merge to `main`: all 15 CDN requests a page makes returned 200, so the client id is **not** origin-restricted. Because the URLs carry `fallback/404`, a 200 means the mark is genuinely present rather than a blank placeholder. Re-check if the client id is ever rotated or a custom domain is added.
   - The failure mode remains worth knowing even though it did not occur: an unreachable CDN renders **every** mark — watchlist, Top Movers, the Today's Activity header, every news thumbnail — as an empty plate, and does so silently, because `alt=""` suppresses even the broken-image glyph (measured). There is no in-app fallback; catching it would need an `onError` handler and so a client component, which reverses the server-component design in `news-thumbnail.tsx`.

   **Five browser-automation artifacts that look exactly like site bugs. All five were chased down once; do not re-investigate them.**

   - **Brandfetch refuses headless Chrome's default UA**, and it fails as `complete: true, naturalWidth: 0` — indistinguishable from a dead CDN. An audit pass reported all 24 logos broken on every route because of this. Override the UA to a normal desktop Chrome string and the same page gets 11/11 `200 image/webp` with the images decoding. This is the third way these URLs cannot be verified, alongside curl and server-side fetches.
   - **`curl … | grep -oE 'grid grid-cols-2[^"]*' | head -1` reads the loading skeleton, not the page.** Next streams `loading.tsx` first, so the first match in the HTML is the skeleton's copy of a shared class string. This produced a confident "the deploy is stale" conclusion when the deploy was live and correct three matches further down. Print every match, or grep for a string that only the new build can contain. `x-vercel-cache: MISS` with `age: 0` confirms a fresh function render, which is how the caching explanation was ruled out.

   - **`/todays-activity/[symbol]` prefetches logged as 503 are not real.** Loading Home in the Chrome extension records 10-11 of the router's `?_rsc=` prefetches as `503`, reproducibly, on every load. They are not server errors: reproduced at 20:57:1x UTC and then read back from `vercel logs` for that second, **every one of those paths returned `responseStatusCode: 200`**, `cache: MISS`, invoked in `sin1` — with `{200: 100}` across the whole log, i.e. not one non-200 response served. Next's router aborts superseded prefetches and the observer records the cancelled connection with a synthetic status; the giveaway is the byte-identical URL `NVDA?_rsc=5CB68i4pnAekjehf` appearing as 200 in one row and 503 in another in the same session. Direct probes never reproduce it — sequential curl (11/11 200, ~0.26s), parallel curl, parallel curl with `RSC`/`Next-Router-Prefetch` headers, and a 12-way concurrent `fetch` from inside the page were all 200. Navigation is unaffected, since a failed prefetch falls back to a full navigation.
   - **In a backgrounded tab the page looks broken and the logos look missing.** The arrival sequence and the `loading="lazy"` thumbnails are both viewport/rAF-driven, so neither runs while the tab is not visible: the article list stays invisible and every mark reports `complete: false, naturalWidth: 0` — indistinguishable from the dead-CDN failure above unless *pending* is separated from *complete-but-zero-width*. One scroll fixes both (measured: 13/13 and 12/12 images `ok`, 0 failed). Check `complete`, never `naturalWidth` alone, and scroll before believing a screenshot.
   - **Console and network capture start when the tool is first called**, so the first read after a page load is always empty and proves nothing — call the tool, *then* reload. Prove the capture works before trusting a clean result: injecting `console.log` + `console.error` returns both immediately. On that basis Home and News are genuinely silent, with every request 200.

   **`vercel logs` returns only the last ~100 entries** — a 1-4 minute window at this traffic — so it cannot be used to look back at something that already happened. Reproduce first, then pull immediately. `vercel inspect --json` omits `meta` entirely, so the deployed commit SHA is not in the CLI output; `GET api.vercel.com/v13/deployments/{id}?teamId=…` with the CLI's own token returns `meta.githubCommitSha`, which is how `ccfd37b` was confirmed live.

5. Final deploy + a short README aimed at the professor.

**Done when**: someone with zero context opens the live URL on a phone and understands what the product does within 30 seconds.

---

## AI call budget (keep this accurate — it's what keeps this inside free-tier limits)

**Two providers now, each with its own free-tier ceiling and its own job.** Gemini writes news summaries only; Groq writes the Today's Story narrative only. They do not share a quota — nothing here trades headroom between them — so each is budgeted separately below.

**Gemini's real limit is 20 requests per DAY, per model.** Measured in Phase 4, read off a live 429: `quotaId: GenerateRequestsPerDayPerProjectPerModel-FreeTier`, `quotaValue: 20`, for `gemini-3.5-flash`. Not per minute — the same key stayed refused for over 15 minutes. This closes the "Gemini free-tier rate limits" open item; the number came from the API itself, not the console and not the docs.

**Groq's real limit is the opposite shape: generous per-day, tight per-minute.** Measured live during planning for `openai/gpt-oss-20b`: a rolling **1,000 requests/day** budget (not the binding constraint) against **8,000 tokens/minute** (the binding constraint). This is why Today's Story is one Groq call per stock rather than a multi-stock batch — a per-minute token cap doesn't care how many requests it took to spend it, and a per-stock call is also what removes the multi-stock JSON-truncation failure mode already seen twice in this codebase with Gemini batches. On a 429, `story-generation.ts` does not retry immediately; it skips that stock for the current run and leaves it for the next scheduled run, the same pattern `selectForSummary` already uses for news. Verified live: two manual test runs in quick succession hit a real Groq 429, and the skip-and-defer path worked exactly as designed with no throw and no retry storm.

- News summarization: **exactly 8 cycles/day × 1 call each = 8 calls/day.** The `news-ingest` schedule is `0 7,10,12,15,18,20,21,2 * * *` UTC — 03:00 / 06:00 / 08:00 / 11:00 / 14:00 / 16:00 / 17:00 / 22:00 ET under EDT, one hour earlier under EST. In ICT, which is the timezone the owner actually reads the site in and which never shifts: 14:00 / 17:00 / 19:00 / 22:00 / 01:00 / 03:00 / 04:00 / 09:00. One call per cycle regardless of article count; articles past the batch cap keep their next-cycle slot rather than adding a call. Seven of the eight land before the summary window, which is the point — see the sequencing note in Phase 5.

  **The 07:00 and 10:00 UTC cycles were added last, and the measurement behind them reversed the assumption that prompted them.** They began as a timezone fix: between 02:00 and 12:00 UTC there was no cycle at all, and that ten-hour hole is 09:00-19:00 ICT, so the News page's "Today" tab was empty every Thai afternoon — exactly when it gets looked at. The window was assumed to be a quiet US overnight where extra cycles would fetch nothing.

  **It is US pre-market, and it is the busiest part of the day.** Counting the publication hour of all 664 stored articles: **47% of a day is published inside that window**, peaking at 11:00 UTC (52 articles) and 08:00 UTC (48). Nothing was ever lost — the noon cycle swept them up — but half the day's news was invisible for up to ten hours.

  **Slots are chosen to shrink the largest waiting bucket, not to space evenly.** An article published in a given hour is stored by the first cycle after it, so each cycle owns a bucket of hours. Largest bucket: **312 articles at six cycles, 206 at seven, 133 at eight.**

  **Cycle count is also the ceiling on summarisation, and that ceiling was already being hit.** `MAX_PER_CYCLE` is 25, so seven cycles cap the day at 175 summaries against real days of 166 — and measured coverage had already slipped to 87% (2026-08-16) and 89% (2026-08-19), i.e. stored articles with no blurb. Eight cycles lift the cap to 200. Raising `MAX_PER_CYCLE` instead was rejected: an oversized batch truncates the model's JSON mid-string and loses every entry in it, which is the reason the cap exists.
- **Gemini total: 12 calls/day** (8 news summarization + 4 Today's Activity daily summary). Today's Activity's 3-field Gemini summary (1 call per batch of 5 stocks, 4 calls/day for all 20) was briefly retired as superseded by Today's Story, then **reinstated 2026-09-26** as its own card, separate from Today's Story — see "Today's Story replaces the AI Daily Summary" under "Decisions that were explicitly reversed" for the retirement and the reversal, and the same-day follow-up entry there for its current title ("What Happened Today") and position (after the Timeline). (It was originally 1 call per stock, i.e. 10/day, before the batching change — see the reversal note there for why that was untenable too.)

  **This job's Supabase Cron entry (`daily-summaries` → `/api/daily-summary`) is still provisioned and was never disabled.** This paragraph used to say those 4 Gemini calls/day were "spent for no reason" because `queries.ts` read `stories` but not `daily_summaries` — **that is no longer true.** The 2026-09-26 reversal (see "Today's Story replaces the AI Daily Summary" above) wired a reader back onto `daily_summaries` for the restored AI Daily Summary card, so this job's output is read again and its quota is not wasted.

- **Groq total: up to 20 calls/day** (Today's Story only) — one call per Top-20 symbol, `STOCKS_PER_RUN = 2` paced across 10 of the same 12-tick `daily-summaries` schedule window Today's Activity's old job used (added as a second job in `scripts/setup-cron.mts`; **not yet provisioned against live Supabase Cron** — `npm run setup-cron` has not been run for it, deliberately left for the owner, same as any infra-affecting cron change). 2 ticks of headroom absorb a run that skips a rate-limited or failed stock.
- Home page: **zero** AI calls (Daily Insight card was cut)

Total across both providers: **32 calls/day worst case (12 Gemini + 20 Groq) against separate ceilings of 20/day and a Groq 8,000 TPM cap** — not a combined number against a single ceiling, since the two providers don't share a quota. Both jobs pass `retries: 0` (or Groq's own skip-and-defer, above), so a 429 or a 503 costs the cycle rather than silently spending two more requests. Never add a call that fires per-article or per-UI-interaction — every AI call in this product is batched or one-per-stock and runs once, after market close, except the intraday news cycles, which are still batched (one call per cycle, not per article).

Budget headroom is not a nicety here. Every failed attempt still spends a request, and so does every manual trigger while testing. At the old 14–16/day the app was one debugging session away from a demo with no summaries in it, with no way to buy more before the next midnight Pacific reset.

### Two Gemini keys: one for testing, one for the deployed site

There are **two separate Gemini API keys, from two different Google AI Studio projects** (the second was registered under a different email). This matters because the quota is `GenerateRequestsPerDayPerProjectPerModel` — **per project**, not per key. Two keys from the *same* project would share one 20/day bucket and the separation would be an illusion; two keys from different projects genuinely get 20/day each.

That the projects really are separate is **measured, not assumed**: the deploy key was exhausted and returning 429 when the test key succeeded on the very next request, in the same minute.

| Key | Where it lives | Used by |
|---|---|---|
| **Deploy** | Vercel env vars, **and `.env.local` by default** | The live site, every Supabase Cron job, and anything run from a laptop unless the key is swapped first |
| **Test** | Nowhere by default — swapped into `.env.local` when needed | Manual job triggers and heavy local testing |

**`.env.local` holds the deploy key as its resting state**, so a laptop and the live site share one 20/day bucket unless someone changes that deliberately. This is a known cost, not an oversight: it keeps local behaviour identical to production, which is what you want when reproducing a bug. The cost is real, though — it is exactly how the quota was exhausted once, and the scheduled jobs then failed with 429 for the rest of the day through no fault of their own, because the laptop had already spent production's allowance.

**So swap the test key in before triggering a job by hand or testing anything that calls Gemini repeatedly**, and swap it back afterwards. A single manual `/api/daily-summary` run costs 1 of the day's 20; a full day's coverage costs 4.

`src/lib/gemini.ts` reads one unlabelled `GEMINI_API_KEY` and knows nothing about environments — the split is entirely a config convention, and it holds only because `.env.local` is gitignored and never deployed. **`.env.local` carries a comment naming which key is currently in it**; that comment is the only way to tell the two apart from the file, so update it whenever the key is swapped. Never write either key into a tracked file, this one included.

One thing that looks like a mismatch and is not: `vercel env pull` cannot read these values back, because every variable on this project is marked **Sensitive**. It writes a short placeholder instead — 12 characters against a real key's ~52 — so comparing a pulled file against `.env.local` proves nothing. Check with `vercel env ls production` that a name is *set*; there is no supported way to read what it is set to.

**Testing locally is not isolated from production, and the keys do not change that.** Local and deployed both point at the *same* Supabase project, so a manually triggered job on a laptop writes real rows to the production database. Observed directly: during one local test run, `daily-summary` reported `alreadyDone: 15` when only 10 had been generated locally — the other 5 came from the Vercel cron writing to the same tables at the same time. Consequences to keep in mind:

- A local "test" run of `/api/daily-summary` or `/api/ingest-news` produces **production data**, not throwaway data.
- Because those jobs skip work that is already done, a local run also *consumes* work the scheduled job would otherwise have performed — the two interfere rather than running independently.
- Separate test and production Supabase projects would fix this properly. Rejected for this build: it means maintaining a second project and re-running every migration, which is real work for a $0 school demo. The mitigation is this note plus running local jobs deliberately, not casually.

## AI Safety / Data Integrity Rules

This is the single source of truth for what the AI is and isn't allowed to say. Every prompt written in Phase 3 (news summarization) and Phase 4 (Today's Story) must enforce this — don't restate a looser version of these rules in either phase, point back here instead. **One clause below is deliberately loosened for all 8 of Today's Story's sections (not News summarization) — see "Today's Story replaces the AI Daily Summary" and the causal-inference widening note right after it, under "Decisions that were explicitly reversed", for exactly what changed, why, and what did not change.**

The product answers **"what happened"** — never "why did it definitely happen" and never "what happens next." That distinction is the whole boundary below.

The AI must never:
- invent news
- invent events
- invent timestamps
- invent numerical values
- calculate new numerical values (all numbers come from structured input, pre-computed — the model states them, it doesn't derive them)
- claim a causal relationship between news and price movement unless that relationship is explicitly stated in the source material — correlation in the data (e.g. "stock moved" + "news happened same day") is not itself grounds for the model to assert one caused the other. **Loosened project-wide for all 8 of Today's Story's sections — originally scoped to just "explanation" and "peerSectorRelation"; widened because the exception was too narrow to ever reach the richest computed input (fundamentals) — see the reversal notes below.** Every claim must still point to a specific figure or label present in Today's Story's structured input; no outside fact, cause, or event may be introduced. News summarization still follows the original rule exactly as written, with no exception.
- predict future stock prices or trends
- offer investment recommendations or advice of any kind (buy/sell/hold framing, "looks like a good entry point," etc.)

The AI may only summarize information present in the structured input it's given for that call. If the available evidence doesn't clearly explain a move, the summary must say so explicitly rather than reaching for a plausible-sounding cause — use a fixed fallback line, e.g. *"The available information does not establish a clear explanation for this movement."* A prompt that leaves the model free to fill that gap with a guess is a bug in the prompt, not an acceptable edge case.

This directly extends Risk #2 in the register above (AI hallucinates numbers) — that risk covers numbers, this section covers claims, causality, and predictions. Both get caught the same way: structured input in, spot-checked output at the gate.

## Risk register

| # | Risk | Mitigation | Owner |
|---|---|---|---|
| 1 | News pipeline overruns Day 12 | Pre-agreed cut order above; deadline doesn't move | Project owner decides only if the cut order itself is somehow insufficient |
| 2 | AI hallucinates numbers, invents facts, or overreaches into causation/prediction/advice | Full rules in "AI Safety / Data Integrity Rules" below — structured input only, no invented values, no unsupported causal claims, no predictions or recommendations | Claude Code writes the prompt; owner spot-checks at the Phase 4 gate |
| 3 | Finnhub rate limit hit during a 10-stock batch | Queue/delay between calls, designed in from Day 8, not patched in afterward. Already in place: `mapLimit` in `src/lib/refresh.ts` caps concurrency at 5 (module-private — `refreshMarketData` is its only caller), and pages make zero upstream calls so traffic cannot affect the limit | Claude Code |
| 4 | Gate review stalls the critical path (this is a solo-reviewer project — no parallel work possible) | Owner blocks calendar time in advance for each gate date above | Project owner |
| 5 | A scheduled ingestion job fails silently — `pg_net` is fire-and-forget, so `cron.job_run_details` shows success even when the endpoint returned 401 or timed out | Treat `net._http_response` as the source of truth when checking any scheduled job. A green cron row proves only that the request was queued | Claude Code |
| 6 | Public ingestion endpoint used to burn upstream rate limits | `CRON_SECRET` guard that **fails closed** (503 when unset). Rotating it means updating `.env.local`, `vercel env add`, then re-running `npm run setup-cron` — two places, easy to half-do | Claude Code |

## Decisions that were explicitly reversed mid-planning — don't revert to the original

These look like they contradict earlier reasoning in this doc. They're not mistakes — they were revisited on purpose after seeing mockups. Trust the version below.

- Market Overview: **5 cards** (not the originally-scoped 3 — Dow Jones and VIX are back in).
- Company logos: **real logos**, not generic badges — accepted for this demo specifically because it won't see commercial deployment.
- Sparklines: **included**, on both Home cards and watchlist rows — the earlier "skip sparklines to save time" call was reversed once the intraday snapshot table made them cheap.
- Today's Activity page: **no secondary tab bar at all** — earlier mockups showed 8 tabs (Overview/News/Events/Financials/Charts/Peers/SEC Filings); all removed in favor of the shell nav + one dense AI narrative (now Today's Story — see below).

- **Today's Story replaces the AI Daily Summary, and one AI Safety rule is deliberately loosened to make it worth having.** The page's narrative used to be a 3-field schema (`movement` / `recap` / `explanation`, see the "narrative is generated in three parts" entry below) written by Gemini and stored in `daily_summaries`. It is now an 8-section narrative (`headline`, `comparison`, `classification`, `unusualness`, `explanation`, `fundamentals`, `peerSectorRelation`, `ytdTakeaway` — `StorySections` in `src/lib/queries.ts` and `src/lib/story-generation.ts`) written by **Groq**, not Gemini, and stored in a new `stories` table (migration `0012_stories.sql`). The page reads it via `getActivity`'s `story` field and renders it in `src/components/todays-story.tsx`. ~~which replaced `daily-summary-card.tsx` (deleted)~~ — see the reversal directly below, this is no longer true.

  **Reversed again, 2026-09-26: the AI Daily Summary card is back, as its own section, not as a replacement for Today's Story.** The owner's read: Today's Story's `headline` section ("What Happened Today") answers what happened, but the product still needs a separate place that states outright **what deserves a reader's attention** — a job the old card did and the new narrative's "headline" does not, however similar the two sections sound. `daily-summary-card.tsx` was never actually deleted from disk (only untracked from git and unwired), so this is a rewire, not a rebuild: it now imports `SectionHeading` and matches the flattened-section visual pattern the rest of the page uses (see "Today's Story's 8 sections no longer nest under one umbrella heading" below), and its heading was changed from the old "What happened to {symbol} today" to **"Worth Your Attention Today"** — the old wording collided with Today's Story's own headline and was the reported problem. `queries.ts` grew a `DailySummary` type and a read of `daily_summaries` (`summary`, `bullets`, `generated_at`) alongside the existing `stories` read, both wired into one `Activity` object; `todays-activity/[symbol]/page.tsx` renders `<DailySummaryCard>` right after `ActivityStats`, ahead of the Price & Volume / Timeline / Today's Story sections that follow. The `daily-summaries` Gemini cron job needed no change — it was already running unread (see the stale note this superseded, just below) — so this reversal costs no new AI calls, only a new reader. Do not re-delete `daily-summary-card.tsx` or the `dailySummary` read on the assumption that Today's Story superseded them; it was tried and reversed.

  **The reason for the rebuild:** the old narrative mostly restated numbers the stat cards already showed, because the AI Safety rule against unstated causation left the model nothing to add beyond paraphrase (see "narrative is generated in three parts" below for the "Norway sovereign wealth fund" case that got that rule locked in the first place). Today's Story gives the model something to *do* — organize the day's price, volume, peer, sector, and fundamentals data into 8 specific analytical answers — without touching prediction or advice.

  **What actually changed in the rule:** the "explanation" and "peerSectorRelation" sections may now infer a plausible, data-grounded connection between the day's news/peer/sector movement and the stock's price move **without** the source article stating that link explicitly — the opposite of the original rule, which required an explicit statement. Every other section of Today's Story, and all of News summarization, is still bound by the original rule with no exception.

  **What stayed banned, in both old and new narratives, with no exception anywhere:** the model still never calculates a new number (every figure is pre-computed and handed to it — see `story-input.ts`), never predicts a future price or trend, and never gives investment advice of any kind.

  **Why the tradeoff was accepted this time:** the original lock was justified by a real, reproduced failure — asked for a single unconstrained narrative, the model reliably asserted causation the sources never claimed. That failure mode was a symptom of an *unconstrained* prompt, not of inference itself. Today's Story's "explanation" and "peerSectorRelation" sections are narrowly scoped (only these two of 8), explicitly fed the exact peer/sector/market figures and news metadata needed to ground an inference, and required to fall back to a fixed honest line (`NO_EXPLANATION` / `NO_RELATION` in `story-generation.ts`) rather than reach for a guess when the data doesn't support one — the same fallback-line discipline used everywhere else in the app. The owner accepted the risk of an occasional over-confident inference in exchange for a narrative that says something about *why*, which is the whole reason this feature exists — see `.scratch/todays-story/spec.md`'s Problem Statement.

- **The causal-inference exception above was widened from 2 of 8 sections to all 8, and the sentence cap was removed — reversing the "explanation"/"peerSectorRelation"-only carve-out just described.** Reported by the owner as reading like restatement, not analysis, despite the page's richest input (fundamentals) being structurally unreachable by the one exception wide enough to use it. `buildPrompt` in `story-generation.ts` now replaces the per-section causal wall with a project-wide grounding guardrail (every claim must point to a specific figure or label in the input; no outside fact, cause, or event may be introduced) plus an explicit anti-redundancy rule (a section must not restate an earlier section's conclusion). The blanket "1-3 sentences" cap is gone for the 7 analytical sections — length is whatever the grounded reasoning needs; only the `headline` section (now framed as a short "What Happened" overview: price move plus the news pick, still brief) keeps a length hint. **What didn't change:** no new numbers, no predictions, no investment advice — grounding in the given input is what keeps this safe, not the section-count of the exception. A separately-editable analysis guideline (`src/lib/story-guideline.ts`, `ANALYSIS_GUIDELINE`) supplies the reasoning *method* (context before attribution, corroborate a lone divergence, state what an explanation covers vs. leaves open, describe before attributing cause, an unusual day isn't evidence of a trend) — imported into `buildPrompt` rather than inlined, so editing reasoning guidance never touches the JSON-schema-assembly code around it. The disclosure footer under Today's Story (`todays-story.tsx`) was updated to state the rule project-wide instead of naming two sections. `buildStoryInput`'s prompt input also now exposes the raw relative-volume figure (previously only a Significant/Normal verdict reached the model) and the AI-paraphrased `news_summaries.summary` in place of the bare headline (falling back to headline when no paraphrase exists yet), so news-grounded reasoning has real article content instead of a title.

  **Groq reasoning effort and token ceiling — measured, not guessed.** Neither knob had been touched before this change. Measured live against production (NVDA/AAPL/MSFT/GOOGL, 2026-09-25 session): `reasoning_effort: "high"` spent its entire completion-token budget on reasoning before emitting any JSON and failed outright (`failed_generation` came back empty); `"medium"` succeeded at 5,261 total tokens — over half of Groq's 8,000 TPM budget by itself, too tight for `STOCKS_PER_RUN`'s two calls to land in the same scheduled tick; `"low"` succeeded at 3,697 and 4,040 total tokens. Settled on `reasoning_effort: "low"` with `max_completion_tokens: 4500` — both set in `story-generation.ts`, plumbed through `generateJson`'s new `reasoningEffort`/`maxCompletionTokens` options in `groq.ts`. **The ceiling is a completion-only cap, so it isn't directly comparable to the total-token figures above** (`groq.ts`'s `GroqResponse` type didn't originally expose the prompt/completion split, only the combined total) — fixed by capturing `usage.completion_tokens` too, then re-measured directly: NVDA 429, AAPL 635 completion tokens at "low" effort, meaning 4,500 is comfortable real headroom, not an extrapolation from the total-token numbers.

  **The `fundamentals` table was found empty in production while checking whether this change had real data to reason over.** Root cause: `refreshMarketData` (`src/lib/refresh.ts`) only ever writes `fundamentals` inline, per-symbol, inside the same cron tick that fetches price/volume — and `/api/refresh` refuses to do any work outside market hours. The fundamentals pipeline deployed on a Friday evening; the market was closed all weekend, so the code had never once executed. Confirmed live this wasn't an upstream-API problem (both Finnhub endpoints involved returned real data for a test symbol on the current key) — fundamentals data has no market-hours dependency at all, it was just waiting behind a gate that exists for price freshness. Fixed with `scripts/backfill-fundamentals.mts` (`npm run backfill-fundamentals`), a one-time, human-triggered script mirroring `backfill-daily-closes.mts`'s shape exactly — it calls Finnhub directly, not through the gated refresh endpoint. Run once against production: all 20 Top-20 symbols got a row. `refresh.ts`'s existing 7-day staleness re-fetch is untouched and stays as the passive safety net if the backfill script is never rerun by hand.

- **Today's Story's 8 sections no longer nest under one "Today's Story" umbrella heading, dropped to 7 sections via a merge, and were reordered on the page — reversing the single-`<h2>Today's Story</h2>` layout described just above.** The owner's complaint: the umbrella heading and the internal `text-micro uppercase` labels read as decoration, not as real section titles — unlike `ActivityTimeline`, where every entry carries its own visible label. `src/components/todays-story.tsx` now renders a Fragment of independent `<section>` blocks, each opening with the shared `SectionHeading` component (`src/components/section-heading.tsx` — the same one `ActivityTimeline` and the Price & Volume section already used), so every part of the narrative reads at the same visual weight as the rest of the page. They inherit the page's existing `flex flex-col gap-10` rhythm automatically, since they're now plain siblings in that flex column rather than nested inside one wrapping `<section>`.

  **The `headline` section is retitled "What Happened Today"** (previously untitled prose inside the umbrella card) and **`comparison` + `peerSectorRelation` are merged into one section, "Sector, Market & Peers"** — the two answered the same underlying question ("what should this move be compared against") and duplicated each other once both were reviewed side by side. The merge is **display-only**: `story.sections.comparison` and `story.sections.peerSectorRelation` are unchanged fields, rendered one after the other inside a single panel under one heading; no schema, prompt, or Groq-call change. The prompt's existing anti-redundancy rule (`ANALYSIS_GUIDELINE`, see above) already discourages one section from restating another, which is why this reads cleanly without a prompt rewrite.

  **Full page order for the "big cards" is now:** Price & Volume + Upcoming Events (moved up, right after the 7 small `ActivityStats` cards) → Timeline → What Happened Today → Company-Specific or Market-Wide → Unusual vs. History → Sector, Market & Peers → Why It Moved → Business & Fundamentals → Year-to-Date. This was worked out against a 9-question checklist the owner wrote for what the page should answer per stock (what happened; what deserves attention; company-specific or industry-wide; unusual vs. history; what to compare against; how it got here; business changes; real-world relevance; running conclusion) — mapped 1:1 onto the sections above, with two questions answered by existing sections rather than new ones: "what deserves attention" is already covered by `headline`'s own news-pick logic, and "real-world relevance" is already covered inside `explanation` ("Why It Moved"). `ytdTakeaway` stays scoped to YTD only — the owner declined turning it into a cross-section summary.

  **`ActivityTimeline`'s on-page heading changed from "Today's Timeline" to "Timeline"** (`src/components/activity-timeline.tsx`) — "What Happened Today" keeps "Today" deliberately, "Timeline" does not, per the owner's explicit call. **The nav item and keyboard shortcut are unchanged, still labeled "Today's Story"** — that string no longer appears anywhere on the page itself, which is a known, deliberate asymmetry rather than an oversight.

  **Reversed again, same day (2026-09-26): the two headings above were swapped, and the AI Daily Summary card moved lower on the page.** The owner's read, after seeing both cards side by side: **"Worth Your Attention Today"** reads more like a plain account of the session, and Today's Story's `headline` section is the one that actually singles out what deserves attention — so the names described the wrong card each. `daily-summary-card.tsx` is now titled **"What Happened Today"** and `todays-story.tsx`'s `headline` section is now titled **"Worth Your Attention Today"**. This is a text-only swap — `Activity.dailySummary`, the `stories` table, and every prop and field name are unchanged; only the two `SectionHeading` labels (and each component's matching empty-state copy) moved. The card's page position also changed: `todays-activity/[symbol]/page.tsx` now renders `<DailySummaryCard>` **after `<ActivityTimeline>`**, not right after `<ActivityStats>` — so the full page order for the "big cards" is Price & Volume + Upcoming Events → Timeline → What Happened Today (the old AI Daily Summary card) → Worth Your Attention Today (Today's Story's former "What Happened Today" headline) → Company-Specific or Market-Wide → Unusual vs. History → Sector, Market & Peers → Why It Moved → Business & Fundamentals → Year-to-Date. This supersedes the page order stated two paragraphs up.

- **A sign-inversion bug was found in the Groq narrative and fixed with an explicit prompt rule — worse than an invented number, since every figure it touches was already correct.** Comparing `"low"` vs `"medium"` `REASONING_EFFORT` (see below) surfaced `openai/gpt-oss-20b` narrating NVDA's real `+0.22%` move as "slipped"/"declined" — reproduced 3/3 times before the fix, present both with and without the per-peer breakdown change described next, so it's a pre-existing model failure mode, not something either change introduced. This is the AI Safety rules' "never invent a numerical value" clause in a form that rule didn't anticipate: the number stated is correct, only its narrated direction is backwards. `buildPrompt`'s "Further rules" in `story-generation.ts` now states explicitly that every percent-change figure already carries its own sign, and that describing a positive change as a decline (or vice versa) is treated the same as inventing a number, however small the move. Verified 2/2 clean re-runs after the fix, against 3/3 wrong before it — same throwaway-script method as the effort comparison, no `stories` table writes.

  **`REASONING_EFFORT` was re-measured against `"medium"` and kept at `"low"`, deliberately, not by default.** `"medium"` produced 2.5–5x more completion tokens but mostly restated the same numbers in more detail rather than reasoning more deeply — AAPL's `"medium"` call alone used 6,938/8,000 TPM (87%), too close to the ceiling for `STOCKS_PER_RUN`'s two calls per tick; covering it would mean dropping to one stock per tick and widening the cron schedule from every 10 minutes to every ~3 minutes, a live Supabase Cron infra change, for a mostly-verbosity gain. Not worth it. Don't re-litigate this without new evidence — re-run the same low-vs-medium comparison if revisiting.

  **Per-peer breakdown replaces the peer average as the only peer figure the prompt sees.** The average alone couldn't say *which* peer moved differently, only that the group did as a whole. `StoryInputParams.peerChangePercents: number[]` → `peerBreakdown: StoryPeerMove[]` (`{symbol, changePercent}[]`) in `story-input.ts`, single source of truth — the average is now derived from it inside `buildStoryInput` rather than passed alongside it. `StoryInput.peers` gained a `breakdown` field; `buildPrompt`'s peer-comparison input gained `"each peer's own percent change today"`. `ANALYSIS_GUIDELINE` (`story-guideline.ts`) gained two matching principles: a conclusion needs at least two connected data points, not one restated figure; and name the specific diverging peer when the data supports it, not just the group average. `story-input.test.ts` covers the new shape.

- **SEC EDGAR 8-K filings are now a Today's Story input, reversing the "SEC filings: never built, and not owed" row this file used to carry.** That row was about the cut SEC Filings tab from Phase 4's early mockups — a document-browsing UI feature, never built and never owed. This is a different decision: one structured fact (form type, filing date, SEC's own item codes) feeding an existing narrative call, never a standalone display surface, never the filing's body text. The distinction is what makes revisiting the old decision correct rather than scope creep.

  **What was built:** `src/lib/sec-edgar.ts` fetches a company's recent filings from SEC's free, no-key per-company submissions endpoint (`data.sec.gov/submissions/CIK##########.json`), identified with a descriptive `User-Agent` per SEC's fair-access policy — the one upstream client in this project where that header carries a real identity rather than a browser-spoofing string. `CIK_BY_SYMBOL` in `src/lib/symbols.ts` hardcodes the Top-20 ticker→CIK mapping, sourced once from SEC's public `company_tickers.json` (confirmed live for all 20 during implementation, same one-time-lookup posture as `PEERS`). Ingestion is folded into the existing 15-minute market-hours-gated refresh cycle (`refresh.ts`), one extra call per Top-20 company (not the index ETFs), filtered to `form === "8-K"` only — verified live against NVDA: 1000 recent filings returned, 61 were 8-Ks, confirming the noise a company's real filing history carries (mostly routine Form 4/144 notices) and why the form-type filter is necessary. No item-code allow-list — every code is stored and passed through unfiltered; the model judges relevance at generation time. Stored in a new append-only `sec_filings` table (migration `0013_sec_filings.sql`), keyed by SEC's own accession number rather than by symbol — same per-event shape as `news`, not the per-symbol cache shape `fundamentals` uses — with `ignoreDuplicates: true` on the upsert so a repeat fetch across ticks never touches an already-stored row. Retention: rolling 370 days, riding the existing `prune_old_data()` schedule with the same never-empty-the-table guard every other retention-pruned table here has. The day's matching filing(s), if any, are wired into `buildStoryInput`/`buildPrompt`'s existing structured input (`story.secFilings`, a `"SEC filing(s) today"` key alongside price/peers/fundamentals/news) — no new prompt section, no new AI-provider call.

  **Verified live end-to-end, including dedup.** A full refresh run against production stored 229 real 8-K rows across the Top 20; a second run left the count at exactly 229, confirming dedup. No Top-20 symbol had a real same-day (2026-09-25) filing at verification time — expected, since most companies file an 8-K only occasionally — so citation was verified with a synthetic same-day row (accession number tagged `TEST-…`, deleted afterward along with the one story it touched): regenerating that stock's story surfaced it correctly and honestly in "explanation" — *"The SEC 8-K filing (items 5.02,9.01) is also present, but its content is not detailed here, so it does not add explanatory weight beyond confirming a filing occurred"* — citing form and item codes only, never guessing at contents.

- **Market Story gained charts on 4 of its 7 sections**, closing the gap the Stocks page's Today's Story already had (3 of 8 sections chart, `todays-story.tsx`). Same test applied both places: a section earns a chart only when its content is one comparable numeric scale, not wherever a number exists.

  **Standout Movers and Sector Leadership** get a new `RankedBars` chart (`story-charts.tsx`) — a variable-length sibling of `ComparisonBars` for a named list of symbols/sectors rather than 4 fixed rows, same zero-centred diverging track when the rows straddle zero. **Volatility & Context** reuses `RangeBar` for VIXY's own trailing-range position (min/max/current, same shape `RangeBar` already draws for a single stock). **Today's Market Story** (the closing section) reuses `YtdChart` for SPY's year-to-date line, the market-wide counterpart to a stock's own YTD chart. Both single-instrument charts are wrapped in a new small `LabeledChart` (naming "Volatility (VIXY)" / "S&P 500 (SPY)"), since — unlike the movers/sector rows, which carry their own labels — a lone RangeBar/YtdChart draws no label of its own.

  **Breadth stays text-only, on purpose.** `computeBreadth` is exactly as chart-ready as `computeSectorAverages`/`computeTopMovers`, but `SessionDigest` already draws the advance/decline bar from the same 20 tickers a few hundred pixels above this section — a second identical bar here would read as a repeat, not a second view. Market-Relevant News and Macro Context stay text-only for the same reason "Why It Moved" and "Business & Fundamentals" do on the Stocks page: a news list isn't a chart, and CPI/unemployment/GDP/Fed-funds don't share an axis, so one bar chart across them would draw a false equivalence between four different units.

  **Every figure a Market Story chart draws is computed from the same functions the Groq prompt was built from** — `computeTopMovers` (moved from being inlined in `market-story-input.ts` into `market-breadth.ts`, alongside `computeBreadth`/`computeSectorAverages`, so both the prompt and the chart call the one function) and `getIndexDailyCloses` (a new batched `queries.ts` read, the page's counterpart to `market-story-generation.ts`'s `loadIndexDailyCloses`). No new upstream call — `page.tsx` already fetches everything these charts need for the narrative; a chart and the sentence beside it can never disagree about a number.

  **`SectionCard` (text optionally paired with a chart, half-and-half at 600px) was extracted out of `todays-story.tsx` into its own `section-card.tsx`**, since Market Story needed the identical card and the alternative was a second copy that could drift from the first.

- **Today's Timeline is rebuilt every 15 minutes during the session, not once at the close.** Phase 4 forbade this outright ("Do not build any real-time listener or intraday cron for this — it would contradict the 'AI runs only after market close' principle"). The owner reversed it: the page should be useful whenever it is opened, and under the old rule the entire trading day showed an empty timeline reading "the timeline is built after the close".

  **The Phase 4 rule conflated two different things, which is why it looked load-bearing and was not.** What must stay after the close is the **AI call** — the Daily Summary narrative — and that is untouched: `daily-summaries` still runs post-close only, and `daily-summary-card.tsx` still says so. The timeline contains no AI at all. It is `buildTimeline` in `src/lib/timeline.ts`, a pure function over stored rows, so rebuilding it more often cannot cost a Gemini request, cannot cost an upstream request, and cannot change what it computes from the same input.

  **It also needs no new schedule, which is the other half of the objection.** `rebuildTimelines` (`src/lib/timeline-rebuild.ts`) is called from `/api/refresh`, inside the market-hours gate that already exists there, so it rides the `intraday-snapshots` cadence rather than adding a cron. "Real-time listener" was never the shape of it.

  **Nothing needed incremental-update logic.** `buildTimeline` recomputes the whole day from scratch on every call, so a partial session simply yields a partial timeline — the open is the first snapshot, the high and low are the extremes *so far*, and `market_close` appears only once a snapshot actually lands at or after the bell (already enforced by `isAtOrAfterClose`, and already covered by a regression test written when a forced mid-session run labelled 13:15 "Market close"). A later rebuild supersedes the earlier rows with the same rules over more data.

  The EOD job still rebuilds too, and that is deliberate rather than redundant: it already loads the same day data for its prompt, so the rebuild costs one pure loop, and it is the backstop for a day whose refresh ticks failed.

- **Today's Timeline shows every article of the day; the 3-row cap is gone.** `MAX_NEWS_ROWS = 3` in `timeline.ts` kept only the most recent three, which put the timeline in direct contradiction with the News & Events stat card immediately above it — the card counts the day's articles and has never been capped, so MSFT displayed "7 articles" over a timeline listing 3. The News page lists a symbol's whole day as well; the timeline was the only surface trimming. Verified against ET day 2026-08-14 after the change: MSFT 7 news → 7 rows, NVDA 12 → 12, CSCO 4 → 4.

The three below were forced by what the free tiers actually do, discovered by probing the live APIs during Phase 1–2. They are not preferences and re-litigating them means re-hitting the same wall.

- **Scheduler: Supabase Cron, not Vercel Cron.** Vercel Hobby permits a cron job to run **at most once per day**, and a more frequent expression *fails at deploy time* — verified against Vercel's own docs. That cannot deliver 15-minute snapshots or a news fetch several times a day (4x when this was written, 8x now). `pg_cron` 1.6.4 and `pg_net` 0.20.4 are available on the Supabase project and `supabase_vault` 0.3.1 is already installed, so the schedule lives in Postgres. Upgrading Vercel to Pro would fix it for $20/mo and is ruled out by the $0 constraint.
- **Volume comes from Yahoo Finance, not Finnhub.** Probed at build time: `/quote` returns no volume field at all, and `/stock/candle` returns `"You don't have access to this resource"` on free tier for both daily and intraday. Without a second source the app loses the `Volume` and `Rel. Volume` columns, two of the three Significant Movement branches, and every sparkline. Yahoo's chart endpoint supplies today's cumulative volume *and* the full session's 15-minute bars, which also solves the sparkline cold-start problem. Finnhub remains the source for price and average volume — **except for the closing price, see the next entry.**

- **The day's closing price comes from Yahoo's 16:00 bar, not from Finnhub's quote.** Finnhub `/quote`'s `c` is the last price it knows of, not the official close, and the closing-window tick reads it *after* the bell — so on the liquid names it has already picked up after-hours trading. Measured on ET day 2026-08-21, where `price_cache` was written at 16:15 ET: 19 of 20 stocks matched the official close exactly, but NVDA read **$214.75 against an official $214.72**. Yahoo's 16:00 bar matched the official daily close on **20 of 20**, and `range=1d` returns no pre/post-market bars, so that bar is the auction print and does not drift. `reconcileClose` in `src/lib/closing-price.ts` therefore stores the print instead of the quote once the session has produced one, re-deriving `change` and `change_percent` from the same previous close so the three figures still describe one another. Mid-session it is a no-op.

  **This is the fix for a real report, and the obvious reading of that report was backwards.** The symptom was the Today's Activity header and AI summary saying `$214.75` while the timeline's "Market close" row said `$214.72`. Because this file names Finnhub the source for price, the first fix pointed the timeline at `price_cache` too — which made all three agree *on the wrong number* and had the app state an untrue close, exactly what the AI Safety / Data Integrity rules exist to prevent. It was committed, measured against Yahoo's official daily close, and reverted (`4a95ea1` then `6f29dc0`). **The timeline was the correct side all along.** Do not "unify" a price mismatch without first establishing which value is true.

  **A second defect shares the same cause: the closing print does not reach the chart at the same moment for every symbol.** `CLOSING_WINDOW_MINUTES` was 30, putting the last qualifying tick at 16:15, and on 2026-08-21 four of the twenty-five — ORCL, CRM, NOW and VIXY — had no 16:00 bar stored at all, so their timelines showed **no "Market close" row** (the rule correctly refuses to call an earlier bar the close). It is now 60, reaching the 16:30 and 16:45 ticks, which sit inside the cron's own 13-21 UTC window under both EST and EDT. **The two changes are load-bearing on each other:** widening the window alone makes a later tick read a *more* drifted quote, so it is only safe together with `reconcileClose`. Do not raise one without the other.
- **Model: `gemini-3.5-flash`, not Gemini 2.5 Flash.** `gemini-2.5-flash` still appears in the model list but `generateContent` returns 404 *"no longer available to new users"*; `gemini-2.5-flash-lite` is gone the same way. Pinned rather than the `gemini-flash-latest` alias, so the summarisation prompt cannot shift under a graded demo. **Reasoning is capped at `thinkingBudget: 2048`** — unbounded reasoning made latency wildly variable (a 13-article batch once took *longer* than a 40-article one, blowing past the 60s function limit), and capping it cut a cycle from ~50s to ~13s and token use from ~20k to ~2.8k. It is not set to 0: some reasoning measurably improves adherence to the safety rules.
- **Today's Activity summaries are batched: one Gemini call per 5 stocks, not one per stock.** **Ratified by the owner.** This contradicts the AI call budget as originally written ("1 call per watchlist stock/day ≈ up to 10 calls/day"), but the alternative was worse. Phase 4.5 keeps the batch size at 5 and widens coverage to all 20 stocks — 4 calls/day. The free tier allows 20 requests/day for this model (measured — see the AI call budget above), so one call per stock spent half the day's entire quota on one job, leaving nothing for a re-run, a failure, or a manual trigger before a demo. Batched, the whole watchlist costs 2 calls and the app runs at ~6–8/day. Batch size is capped at 5 rather than 10 for the reason the news pipeline already found: an oversized batch truncates the model's JSON mid-string and loses every entry in it. Per-stock summary quality was checked against the batched output and did not visibly suffer.
- **The Today's Activity narrative is generated in three parts and joined, not written as one block.** `movement` (price/volume, no news), `recap` (news, no price), `explanation` (the only field allowed to link them). This exists purely to make the no-causal-claims rule hold. Asked for a single narrative, the model reliably asserted causation the sources never claimed — *"Apple's stock price increased **as** Norway's sovereign wealth fund disclosed a position"* — and listing banned wordings did not stop it, because "does the source state this link" is a judgement it makes generously. Split, the fixed fallback line went from rarely used to used on 7 of 10 stocks, with the other 3 attributed to reports that genuinely made the claim. Do not merge these fields back into one prompt.

  **This 3-field schema and the Gemini job that wrote it are superseded by Today's Story** (see "Today's Story replaces the AI Daily Summary" above) — kept here because the reasoning behind the original 3-way split is exactly what justifies Today's Story's own, narrower loosening of the same rule. The underlying finding — an unconstrained prompt reaches for causation, a narrowly scoped one with a fallback line mostly doesn't — is why the new rule was written the way it was, not a reason to distrust it.
- **News categories are drawn from per-symbol tagging, not from Finnhub's news categories.** *(Phase 4.5 keeps these three definitions but computes company-vs-industry per request from `related_symbols` instead of writing it into the row — a per-visitor watchlist makes a stored value meaningless.)* `/news?category=technology` and `/news?category=general` return byte-identical articles (100 of 100 ids overlap), carry no tickers, and are general world/business news. So `company` = watchlist symbols, `industry` = the other Top 20 tech companies, `market` = the general feed. Calling that general feed "Technology Industry News" would simply be false.
- **Company news is relevance-filtered before storage.** Finnhub attaches a queried symbol to articles that are not about that company at all — measured at 55% of results, e.g. a Yeti story and a Pan American Silver story both tagged `NVDA`. An article is only stored under a symbol when its headline or snippet actually references that company (`mentionsSymbol` in `src/lib/symbols.ts`). This is plain string matching, **not** AI inference, so the "tickers come from Finnhub's field, never inferred by a model" rule still holds. Mis-tagging fell from 55% to ~13%.
- **Company logos: two icon libraries covering 17 of 20, lettermark plate for the remaining 3.** Simple Icons no longer ships marks for Microsoft, Amazon, Oracle, Salesforce, Adobe, Texas Instruments, Micron, or ServiceNow, so it alone covered only 12. The marks are now **vendored locally as static SVG under `public/logos/`** — no runtime npm dependency — from two free-to-use icon libraries, recorded per the logo-sourcing rule:
  - **Simple Icons** (CC0-1.0), monochrome: AAPL, AMD, AVGO, CSCO, INTC, INTU, NVDA, PLTR, QCOM, TSLA.
  - **thesvg** (`github.com/glincker/thesvg`), full colour, filling Simple Icons' gaps: ADBE, AMZN, CRM, GOOGL, META, MSFT, MU.
  - **Lettermark plate**: TXN and NOW (no freely-licensed mark) and ORCL (wordmark-only, ~7.7:1, unreadable at badge size).

  This does not reverse the "real logos" decision — the lettermark is still the fallback where no freely-licensed mark exists. Finnhub's `/stock/profile2` returns a logo URL covering all 20 and is an available upgrade, but it is neither source this file named, so it needs an explicit owner call.

  **Superseded in Phase 4.5 — all marks are re-sourced from Brandfetch, and hotlinked rather than vendored.** Simple Icons and thesvg are no longer the source, the vendored `public/logos/*.svg` are deleted, and the thesvg MCP server can now be dropped — Brandfetch coverage is confirmed at 20/20 plus Finnhub.

  **The "vendor the files, do not fetch at runtime" instruction this section used to carry was wrong, and reading the licence is what reversed it.** Brandfetch's terms grant a licence to download, store and cache Content for **at most thirty days** from retrieval, and explicitly do **not** extend to the original logos themselves, which stay third-party IP with no right to reproduce or redistribute. Committing the marks into a public repo would outlive that window, so vendoring was the one delivery method the licence did not allow. Hotlinking is the path Brandfetch designs for: the Logo API is free to 500k requests/month, needs no attribution, and its own fair-use guide names both "educational" projects and "a stock trading app featuring company logos to identify brands" as acceptable use.

  Four things about the implementation that are easy to get wrong:

  - **`theme/dark` is the dark-inked variant, and it is the one to use.** The naming reads backwards: `theme/light` returns the white knock-out mark where it exists at all, which is invisible on the light plate the components draw. Verified in a browser — guessing here makes every logo disappear.
  - **These URLs cannot be verified with curl.** Brandfetch blocks script and server-side fetches of CDN links that carry only the public client id, returning an identical 383KB HTML page with status 200 for every domain, present or not. A shell check therefore "passes" for marks that do not exist. Check in a real browser.
  - **Prefer `symbol`, fall back to `logo`.** Twelve brands have a square standalone `symbol`; the other eight have only the wordmark lockup. `icon` is deliberately unused — it is an opaque JPEG tile for 13 of 21 brands and would sit inconsistently beside the transparent vectors.
  - **`max-w-full` caps a wordmark's width, which sets its drawn height** — the wider the lockup, the smaller it renders. It does not "make the plate wide enough", which is what this file claimed until the measurement was actually taken. In the 80×32 watchlist badge: square symbols draw the full 16px, then micron 15.4px, intuit 14.5px, Qualcomm 13.2px, and **servicenow 10.5px**, which is the weakest badge in the set. The badge padding is `px-1` rather than `px-2` for this reason — the 8px is worth ~1px of height on those four and costs the square marks nothing. Revisit servicenow first if legibility is raised at the gate; `icon` is not an improvement for it (a navy tile with unreadable text) and the lettermark loses the brand entirely.
  - **GOOGL points at `google.com`, not the ticker's own `abc.xyz`**, which resolves to the "Alphabet" wordmark instead of the Google G.

  The workarounds this replaces are all deleted, since coverage reached 20/20: the `HAS_LOGO` set, the TXN/NOW/ORCL lettermark path, and `OPTICAL_NUDGE` (Amazon's `symbol` is a centred square, so the nudge that corrected the old wordmark artwork is no longer needed). `src/lib/logos.test.ts` asserts every `TOP_20` symbol has a mark, so adding a stock without one fails the build instead of rendering a blank badge.

  The client id in `src/lib/logos.ts` is the **public Logo CDN id**, which appears in page source on every render and is meant to be embedded — it is not the private API token. That token lives in `.mcp.json`, which **is gitignored**: do not commit it, and do not move it into any tracked file.

- **Market News thumbnails use the Finnhub logo.** Market news has no company to represent, and per-publisher marks were investigated and ruled out on evidence (see the findings in Phase 4.5). The logo names the data provider, not the publisher — which is honest, if slightly loose, given that company and industry news come from Finnhub too. It replaces a rising-arrow glyph that implied a direction the article might contradict.

## Resolved items (settled during Phase 1–2 — don't re-open)

- **Intraday snapshot cadence: 15 minutes.** Documented in the schema comment in `0001_init.sql`. Snapshots snap to the 15-minute grid — the upstream feed appends a live partial bar stamped with the current time, so without snapping, every refresh leaves an extra off-grid point behind.
- **Index symbols: `QQQ` / `SPY` / `DIA` / `XLK` / `VIXY`.** Confirmed live; see the Data sources table.
- **The "Top 20" is a fixed list**, not a live ranking — no free-tier endpoint ranks US tech by market cap. Defined in `src/lib/symbols.ts`.
- **The watchlist bounds are enforced server-side** in `src/app/api/watchlist/route.ts`, over the cookie, and `readWatchlist()` in `src/lib/watchlist.ts` re-validates on every read so the two can never disagree. An earlier read-path fallback to a hardcoded default list let the cap be pushed to 11, because the API counted table rows while the page counted the fallback — which is why normalisation lives in one function that both paths call. Max 10, min 1, default 7; `normaliseWatchlist` drops unknown symbols and duplicates, clamps, and falls back to the default rather than ever returning empty (covered by `src/lib/watchlist.test.ts`).

- **Data retention: 7 days, enforced by real deletion, not just query filtering.** The free tier has no automatic storage cap and nothing was pruning `news`, `intraday_snapshots`, `timeline_events`, or `daily_summaries`, so all four grew forever. `supabase/migrations/0007_data_retention.sql` adds a `prune_old_data()` function and schedules it directly as a `pg_cron` SQL job (`data-retention-cleanup`, `0 4 * * *`) — pure SQL, not routed through a Next.js API route like the other 3 jobs, because it needs no upstream secret or deployment URL. `news_summaries` needs no separate DELETE — it cascades from `news`.

  **`daily_summaries` is pruned too, deliberately not "just today."** Every read of it (`getActivityUncached` in `src/lib/queries.ts`) fetches only the single most recent trading day per symbol, never a range, and there's no UI to browse a past day's summary — so old rows are dead weight, same as the other three. It's kept to the same 7-day window rather than 1 day because the page's "latest session" over a weekend is still Friday's row; a 1-day cutoff would delete the row a visitor is currently being shown.

  **`price_cache` and `events` are deliberately excluded — this was checked, not assumed.** `price_cache` is a fixed ~25-row cache, one row per symbol, always upserted, never inserted — it never grows, so pruning it saves zero storage while actively breaking pages (Home rows vanish, `/todays-activity/[symbol]` 404s) until the next `/api/refresh` tick repopulates it. `events` (earnings calendar) has low, bounded volume and isn't a growth problem.

  **Physical deletion alone doesn't guarantee the News page never shows anything older than 7 days** — the cleanup job runs once a day, so it can lag by up to ~24h. The actual display-facing guarantee is a query-level floor: `getNewsUncached` and `getNewsAvailableDatesUncached` in `src/lib/queries.ts` both filter to `newsRetentionCutoff()` (`src/lib/news-retention.ts`), independent of when cleanup last ran. Same two-layer pattern as the watchlist cap (API-side enforcement + read-path re-validation). The News page adds **no second cap of its own** — the picker offers every date the floor admits, because a count kept in two places can only disagree with itself, which is exactly how the watchlist cap once reached 11.

  **That floor is a whole ET day, not a rolling `now - 7d` instant** — it was written as an instant first, and that is subtly wrong. Every other date rule in `queries.ts` works in whole trading days, and a sliding instant admits a *partial* oldest day whose article count shrinks on every reload. Measured on 2026-08-18: the table held one lone article on ET day 2026-08-11, exactly the sliver an instant-floor would have offered in the picker as if it were a full day. The floor compares ET days exactly in JS, after the query rather than as a SQL bound: it depends on the newest stored day, which is not known while the query is being built. Nothing is lost by dropping that bound — rows come back newest first, so the limit still takes the newest articles and the floor only trims a tail that failed it.

  **The floor is anchored on the newest stored day, not on the clock alone, and it does whole-calendar-day arithmetic.** Both halves fix bugs that the first version shipped with, and both are covered by `src/lib/news-retention.test.ts`:

  - **A clock-only floor cancels the guard in `0008_retention_keep_last.sql`.** That guard exists because Supabase pauses a free-tier project after ~7 days of inactivity and cron stops with it; on resume it deliberately keeps the last surviving rows so News is not empty. But every one of those rows is older than a clock-only floor, so the readers hid exactly the data the guard had preserved: `getNewsDates()` returned `[]`, `resolveNewsDate` fell back to today, all four tabs rendered empty, and the Home teaser emptied too — while `/todays-activity/[symbol]` kept working, since `getSymbolNews` is not floored. The floor is now `newestStoredDay − 6`, clamped so it is never looser than `today − 6` when fresh data exists (a future-dated upstream `published_at` must not pull the window forward). `getNewsAvailableDatesUncached` reads its anchor from the first row it already fetches (still true — that row is now a day rather than an article; see the entry below); `getNewsUncached` reads it from a one-row query run **concurrently** with the article query, since query depth is what a page pays for.
  - **`Date.now() - 6 * 86_400_000` is 144 fixed hours, not six ET calendar days.** Measured across 2026: between 00:00 and 00:59 ET in spring-forward week the window opened to **8 days** (and the picker's own cap then silently dropped the extra day), and in fall-back week it closed to **6 days**, hiding a day that was still retained. The shift is now done on the ET date's own calendar parts in UTC, so no transition is ever crossed.

  **The job is guarded so it can never empty a table** (`0008_retention_keep_last.sql`). 0007 deleted on absolute age alone, which is correct while the app runs and dangerous when it does not: Supabase pauses a free-tier project after ~7 days of inactivity, cron stops with it, and on resume the next run would find *every* row older than 7 days and delete the lot — blank sparklines, `getLatestSessionDay()` null, empty News until the next ingest cycle, no AI summary until the next post-close run. For a demo whose whole point is a working link to show a professor, that is the one failure that matters. Each DELETE now carries an `AND EXISTS (… WHERE <ts> >= now() - interval '7 days')` guard, so the job trims history but always leaves the last surviving data. Postgres evaluates the EXISTS against the statement snapshot, so the guard reads the pre-delete state rather than chasing its own deletions.

  **Verified positively, because "0 rows deleted" proves nothing.** The first pass ran `prune_old_data()`, saw identical row counts, and called it a pass — but that result is equally consistent with the DELETEs silently matching nothing, which is a live risk since all four tables have RLS enabled with no policies. Settled by reading the catalog: all four are owned by `postgres`, `data-retention-cleanup` runs as `postgres`, so it bypasses RLS as table owner. Then proven by a rollback-guarded test — a synthetic 30-day-old row went 1 → 0 — and both directions were checked across all four tables inside transactions: aged rows are trimmed exactly, and when *every* row is aged out nothing is deleted. Re-run that pair rather than a bare row count if this is ever touched again.

- **The News date picker is a client component, not a native `<details>` disclosure.** It used to be the one dropdown in the app that didn't close on an outside click, because native `<details>` has no such behaviour — every other dropdown (`symbol-switcher.tsx`, `add-stock-menu.tsx`, `watchlist-picker.tsx`) is a client component with an explicit `mousedown` listener. `src/components/news-date-picker.tsx` is a small client island embedded in the still-server `news/page.tsx` (the same pattern those three already use), with its own minimal outside-click/Escape handling — not a reuse of `use-watchlist-menu.ts`, since that hook also carries watchlist-mutation calls and a multi-row ARIA keyboard model that a flat list of date links doesn't need.

- **Gemini API key works.** The `AQ.`-prefixed key authenticates fine against `generativelanguage.googleapis.com`; the unusual prefix was not a problem.
- **One batched Gemini call per cycle is enforced by a batch cap, not by splitting the call.** `MAX_PER_CYCLE = 25` in `src/lib/news-ingest.ts`. An oversized batch truncates the model's JSON mid-string and loses every summary in it, so surplus articles wait for the next cycle rather than triggering a second call.

  **This cap bounds summarisation only — never storage.** It used to bound both, and that was the bug described under "The news pipeline dropped most of the day's articles" below: the cap was applied *before* the upsert, so anything past the 15th was never stored at all. Storage is unbounded now, the cap is 25, and the failure mode is recoverable — a truncated or failed call leaves the articles stored with no blurb, and `selectForSummary` in `src/lib/news-select.ts` picks them up next cycle. The remaining reason for a cap is wall time (~1s/article against the 60s function limit), which `timeoutMs` already enforces.

- **The AI Daily Summary passes every one of a stock's articles for the day — there is no per-symbol cap, and none should be added.** `loadDayDataBatch` applies no limit and `buildInput` passes `news.map(...)` in full, so a stock with 20 articles gets 20 in the prompt. This is easy to confuse with `MAX_PER_CYCLE` above, which is a different pipeline stage (the per-article News-page blurb) and never limited what the daily summary sees.
- **The pinned `gemini-3.5-flash` has now been exercised on the Today's Activity prompt** (Phase 4.5, one run, 5 stocks, 11.8s, 5,140 tokens). This closes the open item about the 2026-08-13 summaries having been generated by `gemini-3.5-flash-lite`. Output was spot-checked against `price_cache`: `$305.50`, `+0.08%` from `0.0786`, `12.6M` from `12,580,343`, `0.21x` from `12,580,343 / 60,432,270` — all exact, and the fixed no-explanation fallback line was used rather than a guessed cause.
- **The news pipeline dropped most of the day's articles, and the AI Daily Summary was the visible casualty.** The reported symptom was the opposite of the cause, so the investigation is worth keeping.

  **The suspicion was that the summary prompt was being fed news from other days. It was not.** `loadDayDataBatch` (now `src/lib/day-data.ts`) narrows by a UTC window and then re-checks every row with `tradingDay(new Date(row.published_at)) !== day`, an exact ET-date comparison. No article from another day can reach the prompt. Do not re-audit this filter.

  **What was actually happening: `MAX_PER_CYCLE` capped storage, not just the Gemini batch.** `fresh = allFresh.slice(0, MAX_PER_CYCLE)` ran *before* the `news` upsert, so on a busy day everything past the 15th was never stored — not deferred, simply absent until a later cycle happened to re-fetch it. Two things made it much worse than it sounds. The overflow was dropped in `TOP_20_SYMBOLS` order, because `fetchAllNews` concatenates per-symbol feeds in that order and the slice takes the head — so the tail of the list starved *deterministically*, every cycle. And only 3 of the 4 news cycles ran before the summary job, giving 45 storage slots against ~90 articles/day.

  Measured on ET day 2026-08-14 by comparing each article's `fetched_at` against that symbol's `daily_summaries.generated_at`: **38 of 86 articles present (55% missing)**. Positions 1–11 of the Top 20 got partial coverage; **CRM, CSCO, INTC, QCOM, MU and NOW got zero and were told "No relevant news was recorded for this stock today"** while the news list on the same page showed real articles. CSCO's four articles for that day were not fetched until `2026-08-15T12:00`, 13 hours after its summary was written. ET day 2026-08-13 lost 14% — the defect scaled with the Phase 4.5 widening from 10 stocks to 20.

  **The fix is to separate storing from summarising, and to store first.** Every fetched article is upserted uncapped; only the Gemini batch is capped, at 25, by `selectForSummary` (`src/lib/news-select.ts`) which picks newest-first from *every* fetched article lacking a blurb — not just the ones inserted this cycle, so a backlog article is picked up later. Storing first also means a slow, failed or truncated call costs a blurb rather than the article. `PER_SYMBOL` went 4 → 8 so a busy stock is not truncated at the fetch step (NVDA had 12 articles in one day). Cycles went 4 → 6 and the summary window moved an hour later; see the AI call budget and Phase 5 item 2.

  **`selectForSummary` lives in its own module for a mechanical reason**, the same one `watchlist.ts` records about `next/headers`: `news-ingest.ts` imports `lib/supabase`, which constructs the client at module load and throws without env vars, so a rule defined there cannot be loaded by the test runner at all.

- **`news.category` is derived at read time, not stored.** Migration `0006_news_category_derived.sql` dropped the `NOT NULL` and the `idx_news_category` index and added a GIN index on `related_symbols`; ingestion no longer writes the column and `getNews` no longer reads it. The rule lives in `src/lib/news-category.ts` with tests. Historic values are left in place — drop the column in a later migration once nothing has read it for a while. Verified against the live table: for every watchlist tried, company + industry + market summed to all 135 rows with no article in two tabs and none in none.

- **The News page's date picker read the whole `news` table, and that took the page down.** Reported as "หน้า news error"; the page served `error.tsx` on **every** request — 5/5 fetches, every tab and date param, one digest `2018010110`, while Home and Today's Activity were clean.

  **The message named the defect exactly**, which is what the `[read]` prefix and the digest channel exist for: `news-dates: row cap hit — 1000 of 1402 rows returned, so the page would render from partial data`. `getNewsAvailableDatesUncached` selected `published_at` from every row just to collapse it into the set of ET days behind the picker, and PostgREST caps a response at 1000. `readRows` compared rows against the exact count and threw — **working exactly as designed**. Do not read this as a bug in `db-read.ts`; it converted a silently-wrong picker into a visible failure.

  **Retention was not the cause, and checking that first is what ruled out the obvious fix.** The table held 1402 rows spanning 2026-08-31 → 2026-09-07 — precisely the window `0007` keeps, so pruning was healthy. The pipeline simply publishes far more than the "low hundreds of rows" the call site's own comment assumed: ET day 2026-09-04 alone holds **253** articles. Those 1402 rows already *were* the retained set, so adding a date bound to the query would have changed nothing.

  **The fix is to stop reading rows to answer a question about days.** Migration `0009_news_days.sql` adds `news_days()`, returning `DISTINCT (published_at AT TIME ZONE 'America/New_York')::date` — the exact SQL equivalent of `tradingDay()`, an ET calendar date with no weekend rolling, so its output compares directly against every other date string in the app. It returns **8 rows against the live table** instead of 1402, one per stored day, so the read is now bounded by the retention window rather than by article volume and cannot approach the ceiling again however busy a day gets. `NOTIFY pgrst, 'reload schema'` is in the migration because PostgREST caches its schema and would otherwise 404 the new function on first call.

  **The day path in `getNewsUncached` is the next read that would fire, and its recorded headroom is stale.** The comment there measured a widest window of 183 rows; at 253 articles for one ET day, the 36-hour window around a busy day now runs ~350–400 against the same 1000 ceiling — roughly 2.5x today's volume from failing, not the comfortable margin the note implied. Tightening the window is still the fix if it does.

  Verified on the deployed site after the merge: **10/10 requests with no error digest**, all seven retained days in the picker, and 253 / 138 articles rendering on the busy days.

## Open items (not yet decided — surface these, don't guess)

- **Confirm no billing is enabled** on the Google AI Studio project — free tier only, by owner requirement. Never hardcode an RPM/RPD number from memory or a blog post; the published figures have changed more than once and sources disagree. (The live limit *was* measured in Phase 4 — 20 requests/day — by reading the 429 body, which is the one source that cannot be out of date.)
- ~~**Brandfetch's licence terms have not been read yet.**~~ **Closed.** Read and recorded: caching is licensed for 30 days only, the underlying marks stay third-party IP with no redistribution right, the Logo API is free to 500k requests/month without attribution, and the fair-use guide names educational projects and stock apps identifying brands as acceptable. This ruled out vendoring and settled the delivery method as hotlinking — see the logo note under "Decisions that were explicitly reversed".
- ~~**The Brandfetch MCP server was misconfigured**~~ — **Closed**, and the `"type": "http"` fix is confirmed working: the `mcp__brandfetch__*` tools connected in the next session and served every lookup this change needed. Kept below because the misdiagnosis is the instructive part.

  **The Brandfetch MCP server was misconfigured, and it was never an approval problem** — worth recording because the planning note guessed wrong and the guess was then repeated. `.mcp.json` declared `"type": "sse"` against `https://mcp.brandfetch.io/mcp`, which is a **Streamable HTTP** endpoint (`/mcp` is the Streamable HTTP convention; SSE servers expose `/sse`). Claude Code opened an SSE GET, the server answered **405**, and the connection never came up — silently, so the session simply had no `mcp__brandfetch__*` tools. Diagnosed with `claude mcp list` plus a direct probe: the same URL answers a Streamable HTTP `initialize` POST with `brandfetch-mcp-server v3.2.4`, so the token and the endpoint were both fine all along. `"type"` is now `"http"`; **the change only takes effect on a fresh Claude Code session**, since MCP servers connect at startup.