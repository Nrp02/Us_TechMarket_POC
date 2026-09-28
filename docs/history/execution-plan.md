> Moved verbatim from CLAUDE.md on 2026-09-29 (commit 1dbde83). History and reasoning, not a summary of current behaviour: where this and the code disagree, the code wins.

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
4. **Today's Story** — this is the core of the page. It replaced the original 3-field "AI Daily Summary" (narrative + bullets) with an ordered narrative covering price, volume, peer/sector/market comparison, historical unusualness, a causal explanation, fundamentals, and a year-to-date takeaway — see "Today's Story replaces the AI Daily Summary" below for what changed and why, including the one AI Safety rule it deliberately loosens. **No longer displayed under one "Today's Story" umbrella heading** — each part renders as its own top-level page section (see the later reversal note on this), though the page is still served at `/todays-activity/[symbol]`. **Reversed since, undocumented until now: the nav item's visible label is "Stocks", not "Today's Story"** — `top-bar.tsx`'s `NAV_ITEMS` reads `{ href: "/todays-activity", label: "Stocks", icon: StocksIcon }`. The route, file names, and keyboard shortcut (`g s`) are unchanged; only the label a visitor sees moved with the Home→Market, Today's Activity→Stocks nav rename (see the Market-page reversal note under Phase 4.5). Because of the narrative's widened scope, every section is fed structured data (exact numbers, not prose) and instructed not to compute or restate numbers on its own — the wider the coverage, the more a small hallucination compounds. There is no separate "Top News" or "Related Stocks" section — that content lives inside the headline and comparison sections now. This is the highest-stakes prompt in the app for the AI Safety / Data Integrity Rules below.
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

5. Final deploy + a short README explaining what the product does.

**Done when**: someone with zero context opens the live URL on a phone and understands what the product does within 30 seconds.

---

