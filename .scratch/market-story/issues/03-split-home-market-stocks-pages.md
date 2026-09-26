# 03: Split Home into Market + Stocks pages, new nav

**What to build:** The shell nav becomes **Market / Stocks / News** (the standalone "Today's Activity" nav slot is dropped — a stock's page is reached by clicking a row on Stocks, not from top-level nav). The root route becomes the new **Market** page: Market Overview (the same 5 cards, unchanged) plus a Market News teaser (reusing the Market News tab's own ranking — no second ranking computed). A new **Stocks** route holds the full, un-personalized Top 20 table (same 8 columns the old "My Watchlist" table had, default sorted by the fixed Top-20 order, no 10-cap, no add/remove) plus the Top Movers Top 5 panel moved over from the old Home page.

**Blocked by:** 01

**Status:** ready-for-agent

Full detail: [`../spec.md`](../spec.md) — see "Nav and page split" under Implementation Decisions.

- [ ] Nav reads Market / Stocks / News everywhere the shell renders it
- [ ] Root route shows Market Overview's 5 cards and a Market News teaser; no watchlist table and no Top Movers on this page
- [ ] New Stocks route shows all 20 symbols (no personalization, no cap) in the same 8 columns as the old watchlist table, plus Top Movers Top 5 using the existing significance-based ranking
- [ ] The old "My Watchlist" table component, the old Home page's watchlist picker slot, and the old Top Movers placement on Home are removed, not duplicated
- [ ] Both pages load with real cached data for at least 3 stocks, matching the "Done when" bar the original Home page gate used
