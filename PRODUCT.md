# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

**Primary: a retail investor who follows US large-cap technology stocks and checks in once a day.** Typically after the US close, on a laptop or iPad, in a short read-only session. Their job is to find out what happened to the handful of stocks they care about without assembling the answer themselves from a broker app, a news feed and a chart.

They have no account, no portfolio and no positions in the product — it holds no money and executes nothing. Every visitor sees the same pages; there is no watchlist or saved state, so the product has no returning-user identity to design around and every visit must make sense cold.

The project owner's professor is the **evaluator, not the audience**. The app is judged on how convincingly it serves the investor above, so conflicts resolve toward that person rather than toward looking impressive to a grader.

## Product Purpose

Answer one question per stock, once a day: **"What happened to this stock today?"**

The pipeline is Watch → Collect → Filter → Understand → Summarize. The product watches a fixed list of 43 US technology stocks for news and market-wide figures, and analyses the Top 20 of them in depth. It collects price, volume, news, filings and events on a schedule, filters out what is mis-tagged or irrelevant, and after the close writes a daily summary and a card-by-card analysis (Today's Story) per Top-20 stock, plus a Market Story for the whole session.

Success is a visitor who understands a day's movement without opening another tool — and who is never told something the underlying data does not support.

## Positioning

**Grounded, not confident.** Most AI market products compete on explaining *why* a stock moved and *what comes next*. This one never predicts and never advises. It may explain, but only from what it was given: every claim in Today's Story and Market Story must point to a specific figure or label in its structured input, no outside fact or cause may be introduced, the model computes no numbers, and a section that the data does not support falls back to a fixed honest line rather than a plausible guess.

The rules differ by output on purpose. News blurbs stay strictly descriptive and never claim a cause the article does not state. The story analyses may infer a data-grounded connection, which the owner accepted in exchange for a narrative that says something about *why*. The grounding, not a ban on inference, is what keeps it honest. A competitor optimising for a confident-sounding explanation cannot truthfully copy this position.

Second, supporting claim: **the visitor's traffic never reaches a metered upstream.** Every external call comes from a scheduled server-side job; pages read cached data only, and AI output is generated once per stock (or per market) per day and stored, never per visitor.

## Operating Context

- **The day boundary is the US market session (`America/New_York`), not the visitor's local day.** The owner is in Thailand/ICT; schedules and market-open logic are all evaluated in New York time so they survive EST/EDT.
- **Nothing on screen is live-ticking.** Intraday snapshots land every 15 minutes, news several times a day, AI summaries and stories after the close; reads are cached up to 60 seconds. The visitor is looking at a recent state of the world, not a real-time one — the product should never imply otherwise.
- **The natural visit is after the close**, when the day is complete and the summary exists. A visit during market hours shows an unfinished session.
- **Three surfaces:** Market (session digest, index cards, Market Story, news teaser), Stocks (one page per Top-20 stock: stats, intraday chart, upcoming events, timeline, AI Daily Summary, Today's Story), and News (Stock News with sector filters, and Market News). Every surface has a date picker over the retained days.
- **Viewed on laptop, iPad and phone.** Phone was a documented non-target and the owner has
  reversed that: it is now a designed width alongside the other two, and the composition has
  since been done rather than merely owed: at 390px the card grids run two-up and the nav card
  holds its items on one row.
  Measured clean — `scrollWidth === innerWidth` on all three routes at 390 / 430 / 600 / 768 /
  834 / 1024 / 1130 / 1280 / 1470 / 1920.
- **The app is presented live**, walked through in front of an audience, as well as opened from a link.
- **The school framing is not permanent.** The owner intends to keep the app live as a portfolio piece and possibly extend it, so decisions should hold up past the submission deadline rather than assuming a single graded demo.

## Capabilities and Constraints

- **Fixed lists, not a live ranking:** 43 tracked stocks for news and breadth, and a Top 20 for deep analysis, defined in `src/lib/symbols.ts`. No free-tier endpoint ranks US tech by market cap.
- **No watchlist and no personalisation.** The per-browser watchlist was removed; every visitor sees the same shared overview.
- **No user accounts, no auth.** This rules out bookmarking, alerts, notifications and saved views — those are out of scope, not deferred.
- **Free tiers only, no billing anywhere.** Three AI providers split the work so no single quota binds: OpenRouter for news blurbs, Gemini for the AI Daily Summary, Groq for Today's Story and Market Story. Every AI call is batched or one-per-stock and scheduled — never per article view, per page view, or per interaction.
- **Market index cards are ETF proxies** (QQQ, SPY, DIA, XLK, VIXY, SOXX) because the free tier rejects real index symbols. `VIXY` tracks VIX **futures**, not VIX spot, and the interface must not imply otherwise.
- **Today's volume comes from an unofficial Yahoo endpoint**, so a failure means "volume unknown" rather than an error.
- **One shared significance rule** (price move ≥5%, or relative volume ≥2.5x, or ≥3% with ≥1.5x) defines the Significant/Normal badge and the Market page's significance count (Top 20 only). It is imported, never reimplemented per surface.
- **AI output rules are product truth, not style:** no invented facts, numbers, events or timestamps; no numbers computed by the model; no claim that is not grounded in the supplied input (news blurbs: no causal claim the source does not state); no predictions; no investment advice in any framing.
- **The product keeps seven days and no more, permanently.** This is a deliberate boundary,
  not a free-tier stopgap: the product is a daily-intelligence tool, not an archive, and
  future work should design around the window rather than treat it as a limit to lift.
  Seven *calendar* days is at most five trading sessions, and fewer across a holiday.
- **The stored week is browsable, one day at a time.** A date picker on every surface selects a
  retained day; the latest session is the default.
- **No confidence score** — considered and cut; an LLM self-reporting confidence is a weak signal.
- Technical decisions, schedules and reversals are locked in `CLAUDE.md`, which remains the authority on architecture and scope. This file records product truth only.

## Brand Commitments

- **Name: US TechMarket.**
- **Voice: factual and non-advisory.** It reports; it does not counsel, reassure, or hype. Buy/sell/hold framing and "good entry point" language are prohibited outright, not discouraged.
- **Company logos are hotlinked from Brandfetch's Logo CDN and may never be vendored** — the licence caps caching at 30 days and grants no right to redistribute the marks. This is a legal constraint on delivery, not a technical preference. Real marks are used for the Top 20; other tracked stocks may fall back to a ticker lettermark.
- Numeric values render in a monospaced face throughout, so figures align and compare down a column.

## Evidence on Hand

- **Live deployment: https://ustechmarket.vercel.app**, publicly reachable, deploying from `main`.
- **Real data end to end** — real Finnhub prices and news, real Yahoo volume, real AI-generated summaries and stories spot-checked against the stored numbers. Nothing on the site is mocked.
- Measured performance figures, quota limits, and outage behaviour are recorded in `CLAUDE.md` with the method used to obtain them.
- **A professor-facing README is written** (111 lines): what the product does, the three
  surfaces, the data sources and the architecture rules.
- **There are no users, testimonials, customers, benchmarks, press, pricing or licensing terms.** None exist. Future work must not fabricate any of them, and must not imply a userbase, track record or financial-services standing the product does not have.

## Product Principles

1. **Report what happened, and explain only from the data given; never what happens next.** This boundary is the product, not a limitation of it.
2. **Say "the evidence does not establish a cause" rather than reach for a plausible one.** A confident wrong answer is worse than an honest gap.
3. **Every number is stored, pre-computed and traceable.** Nothing is derived at render time and nothing is derived by the model.
4. **Visitor traffic must never touch a metered upstream.** Scheduled jobs fetch; pages read cache. This is what keeps the product demonstrable on free tiers.
5. **Scope is cut before deadlines move**, and cut orders are agreed in advance so no one decides under pressure.

## Accessibility & Inclusion

**WCAG 2.1 AA is the bar**, set by the owner. Concretely, future work must hold: 4.5:1 contrast for body text and 3:1 for large text and UI boundaries, in the single dark theme (light mode was dropped deliberately and there is no toggle); full keyboard operation of the symbol switcher and the date picker with a visible focus indicator; and meaningful semantics for tab sets, filters and charts.

One known tension to carry forward rather than rediscover, and one now closed. Numeric change values carry an explicit `+`/`−` sign, and the **sparklines and intraday chart** no longer depend on colour alone either — both are `role="img"` with an accessible name stating direction and range, which closes that gap. Still open: the logo plate is deliberately light against the dark field because several brand marks carry near-black fills that cannot be recoloured, which constrains contrast work around it.

Phone widths (~390px) have since been composed for rather than merely fitted — the card grids run two-up and the nav card holds one row — so this is no longer design work owed. What remains is to keep it that way: a new surface has three designed widths to answer for, not one.
