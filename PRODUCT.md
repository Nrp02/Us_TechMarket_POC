# Product

Current coverage (2026-09-26): News and market aggregates cover 43 tracked
stocks; single-stock deep analysis remains Top 20. News offers All plus six
sector filters. Significance count is explicitly Top-20-only. A free model via
OpenRouter handles news blurbs; Gemini handles AI Daily Summary. News stays
visible when blurbs are pending.

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

**Primary: a retail investor who follows US large-cap technology stocks and checks in once a day.** Typically after the US close, on a laptop or iPad, in a short read-only session. Their job is to find out what happened to the handful of stocks they care about without assembling the answer themselves from a broker app, a news feed and a chart.

They have no account, no portfolio and no positions in the product — it holds no money and executes nothing. Their watchlist lives in their own browser, so the product has no returning-user identity to design around and every visit must make sense cold.

The project owner's professor is the **evaluator, not the audience**. The app is judged on how convincingly it serves the investor above, so conflicts resolve toward that person rather than toward looking impressive to a grader.

## Product Purpose

Answer one question per stock, once a day: **"What happened to this stock today?"**

The pipeline is Watch → Collect → Filter → Understand → Summarize. The product watches a fixed universe of 20 US technology stocks, collects price, volume, news and events for all of them on a schedule, filters out what is mis-tagged or irrelevant, and generates a written daily summary per stock after the market closes.

Success is a visitor who understands a day's movement without opening another tool — and who is never told something the underlying data does not support.

## Positioning

**The restraint is the mechanism.** Most AI market products compete on explaining *why* a stock moved and *what comes next*. This one is explicitly forbidden from doing either: the summary describes what happened, never asserts a cause the source material does not state, and never predicts or advises. Where the evidence does not establish a cause, it says so in a fixed sentence rather than reaching for a plausible-sounding one.

That guarantee is structural rather than a prompt instruction: the narrative is generated in three separate fields — price/volume, news, and the one field permitted to link them — because a single-prompt narrative reliably invented causation that the sources never claimed. A competitor optimising for a confident-sounding explanation cannot truthfully copy this position.

Second, supporting claim: **the visitor's traffic never reaches a metered upstream.** Every external call comes from a scheduled server-side job; pages read cached data only, and AI summaries are generated once per stock per day and stored, never per visitor.

## Operating Context

- **The day boundary is the US market session (`America/New_York`), not the visitor's local day.** The owner is in Thailand/ICT; schedules and market-open logic are all evaluated in New York time so they survive EST/EDT.
- **Nothing on screen is live-ticking.** Intraday snapshots land every 15 minutes, news eight times a day, summaries after the close; reads are cached up to 60 seconds. The visitor is looking at a recent state of the world, not a real-time one — the product should never imply otherwise.
- **The natural visit is after the close**, when the day is complete and the summary exists. A visit during market hours shows an unfinished session.
- **Three surfaces:** Home (market overview, watchlist, top movers, news teaser), News (all / company / industry / market), and Today's Activity (one page per stock — stats, AI daily summary, intraday chart, timeline, upcoming events).
- **Viewed on laptop, iPad and phone.** Phone was a documented non-target and the owner has
  reversed that: it is now a designed width alongside the other two, and the composition has
  since been done rather than merely owed: at 390px the watchlist table becomes cards, Market
  Overview runs two-up with the fifth card spanning, and the nav card collapses to one row.
  Measured clean — `scrollWidth === innerWidth` on all three routes at 390 / 430 / 600 / 768 /
  834 / 1024 / 1130 / 1280 / 1470 / 1920.
- **The app is presented live**, walked through in front of an audience, as well as opened from a link.
- **The school framing is not permanent.** The owner intends to keep the app live as a portfolio piece and possibly extend it, so decisions should hold up past the submission deadline rather than assuming a single graded demo.

## Capabilities and Constraints

- **Fixed universe of 20 US large-cap technology stocks**, defined in `src/lib/symbols.ts`. Not a live ranking — no free-tier endpoint ranks US tech by market cap.
- **Watchlist: minimum 1, maximum 10, default 7**, stored in a per-browser cookie and re-validated server-side on every read. Two visitors do not share a watchlist; two people sharing a browser profile do.
- **No user accounts, no auth.** This rules out bookmarking, alerts, notifications, saved views and personalisation beyond the cookie — those are out of scope, not deferred.
- **Free tiers only, no billing anywhere.** The binding limit is Gemini at 20 requests per day per project; the app runs at a worst case of 12 (8 news cycles + 4 summary batches). Every AI call is batched and scheduled — never per article, per stock page, or per interaction.
- **Market index cards are ETF proxies** (QQQ, SPY, DIA, XLK, VIXY) because the free tier rejects real index symbols. `VIXY` tracks VIX **futures**, not VIX spot, and the interface must not imply otherwise.
- **Today's volume comes from an unofficial Yahoo endpoint**, so a failure means "volume unknown" rather than an error.
- **One shared significance rule** (price move ≥5%, or relative volume ≥2.5x, or ≥3% with ≥1.5x) defines the Significant/Normal badge and Top Movers everywhere. It is imported, never reimplemented per surface.
- **AI output rules are product truth, not style:** no invented facts, numbers, events or timestamps; no numbers computed by the model; no causal claim absent from the source; no predictions; no investment advice in any framing.
- **The product keeps seven days and no more, permanently.** This is a deliberate boundary,
  not a free-tier stopgap: the product is a daily-intelligence tool, not an archive, and
  future work should design around the window rather than treat it as a limit to lift.
  Seven *calendar* days is at most five trading sessions, and fewer across a holiday.
- **That stored week is not exposed anywhere.** Every surface shows the latest session only —
  `getActivity` pins one `sessionDay` and reads a single day's summary — so six of the seven
  retained days are unreachable by a visitor. Whether to surface them is an open decision.
- **No confidence score** — considered and cut; an LLM self-reporting confidence is a weak signal.
- Technical decisions, schedules and reversals are locked in `CLAUDE.md`, which remains the authority on architecture and scope. This file records product truth only.

## Brand Commitments

- **Name: US TechMarket.**
- **Voice: factual and non-advisory.** It reports; it does not counsel, reassure, or hype. Buy/sell/hold framing and "good entry point" language are prohibited outright, not discouraged.
- **Company logos are hotlinked from Brandfetch's Logo CDN and may never be vendored** — the licence caps caching at 30 days and grants no right to redistribute the marks. This is a legal constraint on delivery, not a technical preference. Real marks are used deliberately for all 20 stocks.
- Numeric values render in a monospaced face throughout, so figures align and compare down a column.

## Evidence on Hand

- **Live deployment: https://ustechmarket.vercel.app**, publicly reachable, deploying from `main`.
- **Real data end to end** — real Finnhub prices and news, real Yahoo volume, real Gemini-generated summaries spot-checked against the stored numbers. Nothing on the site is mocked.
- Measured performance figures, quota limits, and outage behaviour are recorded in `CLAUDE.md` with the method used to obtain them.
- **A professor-facing README is written** (111 lines): what the product does, the three
  surfaces, the data sources and the architecture rules.
- **There are no users, testimonials, customers, benchmarks, press, pricing or licensing terms.** None exist. Future work must not fabricate any of them, and must not imply a userbase, track record or financial-services standing the product does not have.

## Product Principles

1. **Report what happened; never why it definitely happened, and never what happens next.** This boundary is the product, not a limitation of it.
2. **Say "the evidence does not establish a cause" rather than reach for a plausible one.** A confident wrong answer is worse than an honest gap.
3. **Every number is stored, pre-computed and traceable.** Nothing is derived at render time and nothing is derived by the model.
4. **Visitor traffic must never touch a metered upstream.** Scheduled jobs fetch; pages read cache. This is what keeps the product demonstrable on free tiers.
5. **Scope is cut before deadlines move**, and cut orders are agreed in advance so no one decides under pressure.

## Accessibility & Inclusion

**WCAG 2.1 AA is the bar**, set by the owner. Concretely, future work must hold: 4.5:1 contrast for body text and 3:1 for large text and UI boundaries, in the single dark theme (light mode was dropped deliberately and there is no toggle); full keyboard operation of the watchlist picker, symbol switcher, add-stock menu and news date picker with a visible focus indicator; and meaningful semantics for the watchlist table, tab sets and charts.

One known tension to carry forward rather than rediscover, and one now closed. Numeric change values carry an explicit `+`/`−` sign, and the **sparklines and intraday chart** no longer depend on colour alone either — both are `role="img"` with an accessible name stating direction and range, which closes that gap. Still open: the logo plate is deliberately light against the dark field because several brand marks carry near-black fills that cannot be recoloured, which constrains contrast work around it.

Phone widths (~390px) have since been composed for rather than merely fitted — the watchlist becomes a two-line list, the five-card grids run two-up, and the nav card holds one row — so this is no longer design work owed. What remains is to keep it that way: a new surface has three designed widths to answer for, not one.
