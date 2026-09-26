# 05: Historical day-ticker + date picker on Today's Activity

**What to build:** A visitor on Today's Activity can pick any of the last 7 trading days (not only the live session) and see that day's real price, change, volume, story, and timeline — reconstructed rather than always showing "now." Today's own live session is unaffected: it keeps reading the existing live cache exactly as it does now.

**Blocked by:** 01

**Status:** ready-for-agent

Full detail: [`../spec.md`](../spec.md) — see "Historical day data (the date picker's hard dependency)" under Implementation Decisions, and the retention-boundary reasoning under Further Notes.

- [ ] A new pure day-scoped ticker builder produces price/change/change%/volume/relative-volume for any symbol on any of the previous 6 trading days, sourced from `daily_closes` (price/change) and that day's `intraday_snapshots` (volume) — no live cache involved
- [ ] Today's Activity gains a 7-day date picker matching the News page's existing picker pattern (same retention-driven bounds, same default-to-latest-available behavior)
- [ ] Selecting a past date re-renders price, the intraday chart, the timeline, and the stored Today's Story narrative for that specific day — all four agree with each other
- [ ] Relative volume on a past day carries a visible disclosure note that it divides by the *current* 10-day average, not a historical one
- [ ] The live/current-session path is provably untouched — no regression on today's numbers
