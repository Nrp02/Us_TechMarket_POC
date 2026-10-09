# ADR 0009 — Remove the watchlist

- **Status:** Accepted
- **Decided:** 2026-09-26 (commit `bbad099`, "ticket 01 — remove watchlist; News becomes Stock News/Market News"); table dropped in migration 0017
- **Recorded:** 2026-10-10

## Context

The original scope had a watchlist (pick up to 10 of the Top 20), first as one global list and then, in Phase 4.5, as a per-browser cookie with a 1–10 cap. It split News into Company and Industry by overlap with each visitor's list, made some reads per-visitor, and needed cap enforcement on both the write and read paths. A bug where a read-path fallback let the cap reach 11 was already in the history.

The product then moved to a market-level view: 43 tracked stocks, a Market Story, and deep analysis for the fixed Top 20. A personal list added complexity without serving the question "what happened today".

## Decision

Remove the watchlist, its API route, `src/lib/watchlist.ts` and the table. News categories become **Stock News** (articles tagged with any tracked ticker) and **Market News** (the general feed, which carries no tickers), derived at read time from the tags (`news-category.ts`). Sector filters narrow Stock News.

## Consequences

- No per-visitor state anywhere: every visitor sees the same data, which makes caching simple and safe (the cache key carries no visitor argument).
- No cookies of its own.
- Several notes in `history/` describe the watchlist; they are history, and the code wins where they disagree.
- The glossary term Category was rewritten to match (`CONTEXT.md`).
