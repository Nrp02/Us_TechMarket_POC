# 02: Fundamentals data pipeline

**What to build:** A per-stock fundamentals record (EPS/revenue growth, margins, latest earnings beat/miss) is fetched and cached for every tracked stock, refreshed only when stale rather than on every price tick, ready to feed the "how has the business changed" section of a future narrative. Not yet surfaced anywhere on the page — this ticket is the data layer only, verified by querying the stored data directly.

**Blocked by:** None (can start immediately).

**Status:** implemented, committed (`a4fbf98`) — pipeline code is in place; the last checkbox (20 populated rows after a live refresh) is unverified, since no live refresh has been triggered against real keys yet.

- [ ] A `fundamentals` table exists (one row per symbol: EPS growth quarterly/TTM YoY, revenue growth quarterly/TTM YoY, gross/net margin TTM, latest earnings period, latest earnings surprise%, updated_at).
- [ ] EPS/revenue growth and margin fields are extracted from the Finnhub metrics response already being fetched for average volume — no new upstream call for those fields.
- [ ] Latest earnings actual/estimate/surprise% comes from a new Finnhub earnings call, taking the most recent quarter.
- [ ] A stock's fundamentals row is only re-fetched when missing or older than 7 days — a normal refresh cycle makes zero fundamentals-related upstream calls once every tracked stock has a fresh row.
- [ ] The table is excluded from the daily retention/pruning job (fixed ~20-row cache, not a growing log).
- [ ] Querying the table directly shows all 20 tracked stocks with populated, plausible-looking values after one full refresh cycle.
