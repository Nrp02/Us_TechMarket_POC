# 01: New stat cards — Peers and Period Performance (YTD/MTD)

**What to build:** On the Today's Activity page, a visitor sees two new stat cards alongside the existing five: "Peers" (this stock's today change% vs. the average change% of its 2–4 peer companies) and "Period Performance" (year-to-date and month-to-date return in one card). Both read real numbers backed by a year of historical daily-close data that now exists for every tracked symbol.

**Blocked by:** None (can start immediately).

**Status:** implemented, committed (`a4fbf98`) — checkboxes below not individually ticked; see `.scratch/todays-story/issues/03-computation-engines.md`'s status line for the one item (7-card grid responsive check) confirmed still unverified in a live browser.

- [ ] A `daily_closes` table exists (symbol, trading_day, close, change, change_percent), backfilled once for all 25 tracked symbols with ~1 year of daily closes, and kept current by an ongoing write on each trading day's close (no new upstream call — reuses the price already reconciled for the existing price cache).
- [ ] `daily_closes` is retained on a rolling ~370-day window (old rows pruned, but a table is never emptied even after a long idle period), riding the existing daily retention job rather than a new schedule.
- [ ] A hardcoded peer map exists for each of the 20 tracked stocks (2–4 peer tickers each), sourced from a one-time lookup rather than a live call.
- [ ] The "Peers" card shows this stock's today change% against the average change% of its peers, using prices already cached for other tracked stocks (no new upstream call for this card).
- [ ] The "Period Performance" card shows both YTD% and MTD%, computed from `daily_closes` (first trading day of the current year / month vs. the latest close).
- [ ] The stat-card grid (now 7 cards) has no orphaned/oddly-spaced card at any of the project's standard test widths (phone, tablet, laptop, wide desktop).
- [ ] A stock with no peer data or insufficient YTD/MTD history shows a clear empty state ("—") rather than a wrong number or a crash.
