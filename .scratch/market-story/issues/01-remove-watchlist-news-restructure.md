# 01: Remove watchlist; News becomes Stock News / Market News with sector chips

**What to build:** The per-browser watchlist personalization is gone everywhere. A visitor no longer picks or edits a personal stock list anywhere in the app. The News page's Company/Industry split (which only ever meant "your list vs. everyone else's") is replaced by an objective split that doesn't depend on any personal state: a **Stock News** tab covering all Top 20 companies equally, filterable by a symbol chip and/or a new 6-way sector chip, and an unchanged **Market News** tab. Today's Activity's header dropdown becomes a flat, alphabetically sorted list of all 20 symbols with no grouping and no add/remove control.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

Full detail: [`../spec.md`](../spec.md) — see "Watchlist removal", "Sector map", and "News restructure" under Implementation Decisions.

- [ ] The watchlist cookie read/write, `/api/watchlist`, the `watchlist` DB table, `watchlist-picker.tsx`, `use-watchlist-menu.ts`, and `add-stock-menu.tsx` are deleted (not left orphaned)
- [ ] Today's Activity's symbol switcher has no `+`/`−` controls and no watchlist/rest-of-20 grouping — one flat alphabetical list of all 20 symbols
- [ ] A new hardcoded sector map assigns exactly one of 6 sectors to every one of the 20 Top-20 symbols
- [ ] News shows exactly 2 tabs: Stock News and Market News (no more All/Company/Industry)
- [ ] Stock News can be filtered by a single symbol, by a single sector, or show everything unfiltered
- [ ] Market News's derivation (empty `related_symbols`) is unchanged
- [ ] No remaining code path reads a watchlist cookie or the deleted table; lint (`no-restricted-imports`) and the build both pass clean
