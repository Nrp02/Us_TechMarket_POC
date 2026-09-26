# 07: Market Story narrative generation (Groq) + display on Market

**What to build:** A visitor opening the Market page sees a full "what happened in the market today" narrative — 8 sections covering the overall read, standout movers, sector leadership, breadth, market-relevant events, macro context, volatility/context, and a closing synthesis — generated once a day after close, laid out exactly like Today's Story: a row of stat-style cards (Market Overview) followed by one continuous full-width narrative running section by section beneath it, not a grid of small cards.

**Blocked by:** 01, 02, 03, 04

**Status:** ready-for-agent

Full detail: [`../spec.md`](../spec.md) — see "Market Story generation" under Implementation Decisions, and the "AI Safety / Data Integrity Rules" and layout-parity notes referenced there.

- [ ] One Groq call per day, post-close, in the same schedule window Today's Story's batch already uses (no new cron entry for one call)
- [ ] All 8 sections are fed pre-computed structured numbers only (breadth from ticket 04, sector averages from the ticket-01 sector map, `SOXX`/`XLK`/index proxy moves, macro data from ticket 02, news) — the model states, never derives, a number
- [ ] The same project-wide loosened causal-inference rule Today's Story uses applies here (grounded in structured input, no outside facts, no predictions, no investment advice), with the same fixed-fallback-line behavior when the input doesn't support a claim
- [ ] On a 429 or failure, the run skips and defers to the next scheduled run rather than retrying immediately (mirrors Today's Story's existing behavior)
- [ ] Storage is a new table analogous to `stories` (one row per trading day), pruned to 7 days with the same never-empty-the-table guard
- [ ] The Market page renders the narrative using the same component/visual pattern as `todays-story.tsx` — full-width panels stacked vertically, not small cards in a grid
- [ ] Spot-checked against the underlying raw numbers for at least 3 sample days, matching the verification bar Today's Story was held to at its own gate
