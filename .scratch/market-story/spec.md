# Market Story: replace personalized Home with a whole-market daily narrative

## Problem Statement

Today's Home page is a personalization feature built for a product with no accounts: a per-browser cookie watchlist that lets a visitor pick up to 10 of the Top 20 stocks to see in "My Watchlist." For a professor watching a demo once, that personalization buys nothing, and it actively complicates the one page meant to be the front door — the News page's Company/Industry split only means anything in terms of "your list vs. everyone else's," which stops being a meaningful distinction once there's no "your list."

Separately, the product answers "what happened to this stock today?" per stock (Today's Story) but has no equivalent for the market as a whole. A visitor gets 20 individual stories and no way to see the day's overall shape — was it broad or narrow, which sector led, what macro backdrop the day sat in.

## Solution

Remove the watchlist system entirely. Replace the personalized Home page with a **Market Story** page — the same "narrative over structured input" pattern already proven by Today's Story, but scoped to the whole market instead of one stock. Rename the shell nav from Home/News/Today's Activity to **Market / Stocks / News**, where "Stocks" is the full, un-personalized Top 20 table (formerly "My Watchlist"). Recast News's Company/Industry split as objective, watchlist-independent categories: a flat "Stock News" tab (filterable by symbol or by a new 6-way sector grouping) and the unchanged "Market News" tab. Add a 7-day date picker (mirroring the News page's existing one) to Market, Stocks, and Today's Activity, so a visitor can look at any of the last 7 trading days, not only the live session — which happens to be exactly the window every relevant table already retains.

## User Stories

1. As a visitor with zero context, I want the front page to tell me what happened in the market today in plain language, so that I don't have to read 20 individual stock pages to get the shape of the day.
2. As a visitor, I want to know whether today's market move was broad-based or concentrated in a few names, so that I don't overread a single stock's move as "the market."
3. As a visitor, I want to know which sector led or lagged today (e.g. semiconductors vs. the rest of tech), so that I can see structure inside "tech" rather than one undifferentiated blob.
4. As a visitor, I want to know about any market-relevant macro event today (a CPI print, a Fed decision), so that I have context for why the whole market might have moved together.
5. As a visitor, I want the volatility and overall market context stated plainly, so that I know whether today was an unusually calm or turbulent session.
6. As a visitor, I want a full list of all 20 tracked stocks (not just a personal subset), so that I can see the whole universe the product tracks without having to "add" anything first.
7. As a visitor, I want to see which stocks moved the most today, ranked, so that I know where to look first.
8. As a visitor, I want to browse news either by a specific stock or by a whole sector (e.g. "show me all semiconductor news"), so that I'm not stuck with only a per-symbol view.
9. As a visitor, I want to pick a date from the last 7 trading days on the Market, Stocks, or Today's Activity pages, so that I can revisit a recent day instead of only ever seeing "today."
10. As a visitor looking at a past day, I want the numbers I see (price, volume, relative volume) to be honestly labeled as historical, so that I don't mistake an approximation for a precise figure.
11. As the project owner, I want the watchlist cookie infrastructure fully removed (not left orphaned), so that the codebase doesn't carry dead personalization code with no future reader.
12. As the project owner, I want the new macro data source to cost nothing and risk no billing, so that the zero-budget constraint holds.

## Implementation Decisions

**Watchlist removal**
- Delete: the watchlist cookie read/write (`src/lib/watchlist.ts`), `/api/watchlist`, the orphaned `watchlist` DB table, `watchlist-picker.tsx`, `use-watchlist-menu.ts`, `add-stock-menu.tsx`, and the `+`/`−` editing UI inside the Today's Activity symbol switcher.
- `daily-summary.ts` and the `daily_summaries` table were already orphaned by Today's Story and are unaffected by this change (leave as-is, per existing "don't delete, just stop reading" precedent for that specific piece — it predates this decision and is out of scope here).

**Nav and page split**
- Shell nav becomes **Market / Stocks / News** (drops the standalone "Today's Activity" nav slot — a stock's Today's Activity page is reached by clicking a row on Stocks or Top Movers, not from top-level nav).
- **Market** (root route) = Market Overview (5 cards, unchanged) + Market Story narrative + Market News teaser (reuses the "Market News" tab's ranking, same "don't compute a second ranking" rule the old Home teaser followed) + a 7-day date picker.
- **Stocks** (new route) = the full Top 20 table (same 8 columns as the old watchlist table), default sorted by the fixed `TOP_20_SYMBOLS` order, no personalization, no 10-cap — everyone sees all 20. Top Movers Top 5 (unchanged ranking rule) moves here from Home. A 7-day date picker sits where the old "add stock" control used to be.
- **Today's Activity** (`/todays-activity/[symbol]`, unchanged route) — header dropdown becomes a flat, alphabetically sorted list of all 20 symbols with no grouping and no `+`/`−`. Adds the same 7-day date picker.
- Layout composition for Market follows the Today's Activity/Today's Story pattern: a row of stat-style cards (Market Overview's 5 cards) above one continuous narrative card (Market Story), not a scattered dashboard grid.

**Sector map**
- New hardcoded `SECTOR_BY_SYMBOL` (one label per Top-20 symbol, one-time manual lookup, same posture as the existing `PEERS` map), 6 buckets covering all 20 symbols: Semiconductors, Software/Cloud, Internet/Platform, Hardware/Devices, AI/Data Analytics, EV/Auto.
- This single map backs two consumers: the News page's sector filter chips, and Market Story's sector-leadership section (computed by averaging the Top 20's own price moves within each bucket — no new upstream call).

**News restructure**
- Collapses today's 4 tabs (All/Company/Industry/Market) into 2: **Stock News** (all Top-20-tagged articles, filterable by symbol chip and/or sector chip) and **Market News** (unchanged — still identified by empty `related_symbols`, never watchlist-derived).
- Company-vs-industry, which was derived per-request from watchlist overlap, is removed entirely; there is no more "your stocks vs. the rest" distinction anywhere in News.

**Sub-sector market proxy**
- Add `SOXX` (semiconductor ETF) to ingestion as a market-level proxy, same mechanism as the existing `XLK` (Finnhub `/quote`, confirmed live on the current free key). This is a broad-market semiconductor read, distinct from (and complementary to) the sector map's internal Top-20 breakdown — `XLK` remains the whole-Technology-sector proxy; `SOXX` is the one sub-sector proxy added for v1. No other sub-sector ETFs are added in this pass.

**Breadth**
- New pure computation (no AI): count of Top 20 advancers vs. decliners, plus how many clear the existing Significant Movement rule. This feeds Market Story's "broad vs. concentrated" section; no new formula, reuses the significance rule already shared by the Status badge and Top Movers.

**Historical day data (the date picker's hard dependency)**
- Today's live path is unchanged: "today" on all three pages still reads `price_cache` (a live-only cache with no history) exactly as now.
- A **new day-scoped ticker builder** produces the same `Ticker` shape (price, change, change%, volume, rel. volume) for any of the previous 6 trading days from `daily_closes` (price/change, retained 370 days) plus that day's `intraday_snapshots` (volume, retained 7 days) — the binding constraint on how far back the picker can go is the 7-day snapshot retention, not an arbitrary UI choice. This one builder is shared by Stocks, Today's Activity, and Market — not duplicated per page.
- Relative volume on a past day divides by the *current* 10-day average volume (the only value stored — there is no historical average), which is displayed with a small disclosure note, mirroring existing disclosure conventions in the product (the VIXY note, the Today's Story causal-rule footer) rather than being hidden.
- The date picker itself follows the News page's existing 7-day picker pattern and constraints (never earlier than what retention actually holds, defaults to the latest available session when no date is chosen).

**Macro data (Market Story input)**
- New isolated upstream client `fred.ts` (mirrors the existing `finnhub.ts`/`yahoo.ts` isolation — reachable only from a scheduled ingestion job, enforced by the existing `no-restricted-imports` rule), using FRED's free, no-billing API (the project owner already holds a key) to read release-level data for CPI, unemployment, and GDP.
- FRED gives a *value and its history*, not a calendar with consensus/expectation — so the macro section reports "what was released today and how it compares to the prior reading," never a forecast-vs-actual "surprise" framing, since no free source for expectation data was found without real billing or reliability risk (Trading Economics needs a paid plan for this use; the FMP calendar endpoint and the ForexFactory feed were both considered and rejected — see Further Notes).
- FOMC meeting dates are public knowledge published by the Federal Reserve well in advance, so they are hardcoded as a small hand-maintained calendar (same one-time-lookup posture as `PEERS`/`CIK_BY_SYMBOL`/the new `SECTOR_BY_SYMBOL`), checked against FRED's own fed-funds-rate series to report whether a decision changed the rate.
- Macro data rides the same retention posture as everything else Market Story reads (7-day window, guarded against ever emptying the table).

**Market Story generation**
- One Groq call/day, post-close, mirroring Today's Story's `story-generation.ts` exactly (same provider, same "skip and defer on a 429" behavior, same fixed-fallback-line discipline when the input doesn't support a claim).
- Applies the same project-wide loosened causal-inference rule Today's Story uses (grounded in structured input, no outside facts, no predictions, no investment advice) across all 8 sections — not the stricter original News-summarization rule.
- The 8 sections (working names, not final copy): overall market read, standout movers, sector leadership, breadth, market-relevant events, macro context, volatility/context, and a closing "today's market story" synthesis. Every section is fed pre-computed structured numbers (breadth counts, sector averages, SOXX/XLK/index proxy moves, macro release data) exactly as Today's Story's sections are — the model states, never derives.
- Stored in a new table analogous to `stories` (one row per trading day, not per symbol), pruned to 7 days with the same never-empty-the-table guard the other four pruned tables already carry.

**AI call budget**
- Adds 1 Groq call/day. Groq's per-day ceiling (1,000/day) and per-minute token ceiling (8,000 TPM) both have ample headroom for one more once-daily call; no schedule contention expected, but the call should still land in the existing post-close window used by Today's Story's batch, not a separate cron entry, to avoid adding a new schedule for one call.
- Gemini's budget is unaffected — Market Story does not touch it.

## Testing Decisions

Following this codebase's existing convention exactly: every test is a pure-function unit test in `src/lib/`, with zero `.tsx`/component tests anywhere in the current suite — this spec does not introduce the first one.

- `sector-map.test.ts` — completeness assertion (every `TOP_20_SYMBOLS` entry has exactly one sector), mirroring `logos.test.ts`'s "every Top-20 symbol has a mark" pattern.
- `market-breadth.test.ts` — `computeBreadth` against synthetic ticker arrays (all up, all down, mixed, edge cases at the Significant Movement thresholds), mirroring `significance.test.ts`.
- `day-ticker.test.ts` — the new day-scoped ticker builder against synthetic `daily_closes` rows + snapshot rows, with no DB involved, mirroring `period-performance.test.ts`/`timeline.test.ts`'s pure-function-over-stored-rows style.
- `fomc-calendar.test.ts` — pure calendar-lookup helpers (is-a-meeting-day, most-recent-decision) against a fixed hardcoded list, no network.
- `fred.ts` itself is an isolated upstream client and is not unit-tested directly, same as `finnhub.ts`/`yahoo.ts` today — it is exercised through the ingestion job it's used from.
- `market-story-input.test.ts` — the structured-input builder (breadth + sector + macro + news → the shape handed to the prompt), mirroring `story-input.test.ts` exactly.
- `market-story-generation.ts`'s prompt/schema builder gets a shape-only test (fields present, no missing section keys) — never an assertion on actual AI output, matching how `story-generation.ts` is (or isn't) tested today.
- `news-category.test.ts` gains cases for the new sector-chip filter, alongside its existing `categoriseNews` cases.
- `watchlist.test.ts` is deleted along with `watchlist.ts`.

## Out of Scope

- Sub-sector ETF proxies beyond semiconductors (software, hardware, etc.) — v1 ships one (`SOXX`); others are a follow-up if this pattern proves useful.
- Macro "surprise" framing (actual vs. consensus/forecast) — no free, billing-safe source was found that has this shape; the macro section only ever reports the released value against its own prior reading.
- BLS/BEA direct API integration — redundant with FRED, which already aggregates both; not worth a second/third upstream client for the same underlying data.
- Any security/vulnerability data feed (e.g. CISA KEV) — raised and explicitly deferred; no clear mapping from a CVE/vendor feed to a Top-20 ticker exists yet, and it doesn't fit this spec's macro-market scope.
- Intraday rebuilding of Market Story — it is a once-a-day, post-close narrative like Today's Story, not a live-updating one.
- Any change to Today's Story itself (the per-stock narrative) beyond the shared day-ticker/date-picker plumbing — its own 8-section schema, prompt, and generation logic are untouched.

## Further Notes

- The 7-day date-picker window is not an arbitrary UI choice — it is the actual ceiling of what `intraday_snapshots`, `news`, `timeline_events`, and `stories` retain today (verified against the migrations). `daily_closes` alone goes back 370 days, but without matching historical volume there is no honest way to show a consistent 8-column table further back than 7 days, so 7 days is where the real data ends, not where the UI arbitrarily stops it.
- Macro-data sourcing was researched live before this decision: Finnhub's `/calendar/economic` is confirmed premium-gated on the free tier; Trading Economics' calendar needs a paid plan for this kind of use; FMP's calendar endpoint and the ForexFactory feed were both identified as possible but were passed over in favor of FRED specifically because the owner already holds a working, zero-risk FRED key and FRED alone (without a forecast/consensus layer) is judged sufficient for this feature's honesty bar.
- `SOXX` and `SMH` (both semiconductor ETFs) were confirmed live against the current free Finnhub key during scoping; `SOXX` is the one carried into this spec.
