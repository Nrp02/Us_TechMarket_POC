# 06: Extend the date picker to Stocks and Market

**What to build:** The same 7-day date picker and day-scoped data path from ticket 05 is reused (not reimplemented) on the Stocks page and the Market page, so a visitor can view any of the last 7 trading days consistently across all three pages that support it. On Stocks, the date picker takes the position the old "add stock" control used to occupy.

**Blocked by:** 03, 05

**Status:** ready-for-agent

Full detail: [`../spec.md`](../spec.md) — see "Historical day data" and "Nav and page split" under Implementation Decisions.

- [ ] Stocks page gets the same 7-day date picker, placed where the removed "add stock" control used to sit
- [ ] Selecting a past date on Stocks shows that day's real 20-row table (price/change/volume/rel. volume/status) via the ticket-05 day-ticker builder, not the live cache
- [ ] Market page gets the same 7-day date picker; selecting a past date shows that day's Market Overview figures reconstructed the same way
- [ ] No second implementation of the day-scoped ticker builder exists — Stocks and Market both call the one from ticket 05
- [ ] All three date-scoped pages (Today's Activity, Stocks, Market) share the same retention-driven bounds and default-to-latest behavior
