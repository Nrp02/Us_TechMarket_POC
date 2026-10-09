# ADR 0005 — Take the closing price from Yahoo's 16:00 bar, not Finnhub's quote

- **Status:** Accepted
- **Decided:** 2026-08-24 (`src/lib/closing-price.ts`, commit `1f42daf`)
- **Recorded:** 2026-10-10

## Context

Finnhub's `/quote` returns the last price it knows about, not the official close. By the time the closing-window refresh ran, the quote had picked up after-hours trades on the most liquid names. Measured on 2026-08-21 with `price_cache` written at 16:15 ET: 19 of 20 stocks matched the official close, but NVDA read $214.75 against an official $214.72. The header and the AI summary both called that figure the closing price, so the app was stating something untrue.

## Decision

`reconcileClose` prefers Yahoo's 16:00 ET bar once the session has produced one. `range=1d` excludes pre- and post-market bars, so that bar is the closing auction result and does not keep drifting. Measured, it matched the official daily close on 20 of 20 symbols. The function self-gates: only a bar at or after 16:00 ET can stand in for the close, so a mid-session call returns the live quote.

It is pure (no database import) so the rule is testable.

## Consequences

- The stored close is the exchange's number. `price_cache` remains a quote-derived row; the daily-close timeline is the side that is correct when the two differ.
- **Do not "unify" a price mismatch without establishing which value is true.** A difference between the two sources after hours is expected, not a bug.
- If Yahoo is unavailable the quote is stored and a small after-hours drift is possible ([data-sources/yahoo.md](../data-sources/yahoo.md)).
