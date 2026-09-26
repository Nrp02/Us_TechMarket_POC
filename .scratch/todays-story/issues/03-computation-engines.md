# 03: Computation engines for Today's Story

**What to build:** A set of pure, deterministic functions that turn the raw data now available (prices, peers, historical closes, fundamentals, news) into the fixed numbers and classification labels a narrative-generation call will need — significance, peer/sector/market divergence, company-vs-market classification, volatility percentile, 52-week range position, earnings-surprise classification, and fundamentals trend — composed into one payload by a single assembler function. No AI call yet; this ticket is verified by unit tests against the assembler, not by anything visible on the page.

**Blocked by:** 01 (needs `daily_closes` and the peer map), 02 (needs `fundamentals`).

**Status:** done — implemented, tested (125/125 `npm test`, `tsc --noEmit` and `npm run lint` clean), not yet wired into `queries.ts`/the page (that's ticket 04's Groq call, per the assembler's own "no AI call yet" scope).

- [x] Given a stock's price/volume figures, the existing significance rule's result is available as an input to the assembler (reused, not rebuilt).
- [x] Given a stock's and its peers' today change%, a function returns the peer average change% and the stock's divergence from it.
- [x] Given a stock's, its sector's, and the market's today change%, a function returns the divergence from each and a same-direction/opposite-direction flag.
- [x] Given those divergence figures, a function classifies the move as company-specific or market-wide by a fixed threshold rule.
- [x] Given a stock's daily-close history, a function returns the percentile rank of today's |change%| against the stock's own historical daily moves, and a second function returns where today's price sits within the trailing 52-week high/low range.
- [x] Given a stock's fundamentals row, one function classifies the latest earnings result (beat/miss/inline) and another classifies whether growth is accelerating, decelerating, or stable.
- [x] A single assembler function takes a symbol plus the day's already-loaded data and returns one payload containing every value above, plus the day's news items — no network or database call inside the assembler itself.
- [x] Unit tests cover each engine's edge cases (missing peer data, empty history, a zero/negative baseline) and assert the assembler's full output shape for at least one realistic scenario.
- [x] None of these functions produce free text — every output is a number or a value from a fixed, named set of labels.
