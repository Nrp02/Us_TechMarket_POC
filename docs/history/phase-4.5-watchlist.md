> Moved verbatim from CLAUDE.md on 2026-09-29 (commit 1dbde83). History and reasoning, not a summary of current behaviour: where this and the code disagree, the code wins.

## Phase 4.5 — agreed scope change, BUILT except the logos

**Read this before trusting anything below it.** Changes 1–4 below are **in the code and verified**; change 5 (logos) is **not built** and is blocked — see the work order. Where this section contradicts a statement further down this file, this section is the newer decision and wins — the older text is left in place deliberately so the reasoning that produced it is still readable.

**Reversed later, and not by anything else in this file: the entire per-browser watchlist mechanism described below (cookie storage, the watchlist API, the add/remove UI) was removed.** Commit `bbad099` ("remove watchlist; News becomes Stock News/Market News") deleted `src/lib/watchlist.ts` outright — there is no `cookies()` call and no `next/headers` import anywhere in `src/` anymore. Home became the Market page: a single shared overview over all `TRACKED_STOCK_SYMBOLS` (now 43, see the widened-scope note at the top of this file) rather than a personalized per-visitor watchlist, and News collapsed from four category tabs to two (Stock News / Market News, split by whether `related_symbols` is empty — see `news-category.ts`). Everything below this note that describes the cookie, the 7/1/10 min/default/max bounds, or per-visitor News categorisation is history explaining a decision that was later undone, not the current behavior. See `US_TECHMARKET_PROJECT_OVERVIEW.txt` sections 4 and 6 for what actually ships today.

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

