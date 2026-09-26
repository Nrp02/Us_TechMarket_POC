# Recent Trend — spec

Status: ready-for-agent

## Approved scope clarification (2026-09-27)

- Single-stock deep analysis remains Top 20. Insufficient-history behavior
  is verified through engine/assembler fixtures; the 23 extended stocks do
  not gain Today's Story generation in this feature.
- Rename the displayed Market Story card "Year-to-Date Context" to
  "Market Takeaway". Keep `closingSynthesis`, its prompt instruction, and
  its existing XLK YTD chart unchanged. This supersedes references below
  to preserving the old heading or restricting that section to YTD alone.
- Recent Trend reasoning remains in "Unusual vs. History" for stocks and
  "Volatility & Context" for Market Story. No engine redesign was approved.
- Approved read-path exception: Market Story reuses the charts' existing
  `getIndexDailyCloses` paginated reader. The original 1000-row query
  excluded VIXY/XLK despite stored history (live reproduction: DIA 251,
  QQQ 251, SOXX 251, SPY 247; no VIXY/XLK). This adds DB page reads when
  needed, but no upstream API, cron, schema or new aggregation logic.

## Confirmed engine rules (2026-09-27)

The owner corrected the original plan to match the researched market
structure rule: compare the latest two peaks separately from the latest
two troughs. Higher High + Higher Low is uptrend; Lower High + Lower Low
is downtrend. Conflicting or equal comparisons are no-clear-trend.
With exactly one swing, read the leg from that swing to the final close;
with no swing, use net window change and the original 1% flat threshold.
Reversal age is the age of the latest swing used in this read: the latest
of the paired peaks/troughs, or the single swing.

Conservative completion for two/three swings without both same-kind pairs:
no-clear-trend, with null reversal age because no qualifying direction
comparison was possible. This does not infer a direction from unlike swings.
Tests must include Higher High + Lower Low and the inverse conflict.

Live verification exposed the model conflating signed net window change
with the supplied direction (e.g. NVDA: downtrend, +6.69% net window gain,
today +0.22%). Each prompt therefore includes a precomputed qualitative
today-vs-direction label. This is a sign comparison in prompt assembly,
not an engine rule or output-contract change; it never infers a reversal.

## Problem Statement

Today's Story and Market Story only ever compare the current session to same-day reference points (peers, sector, market, 52-week range, YTD-to-date). Neither narrative ever reasons about the path a stock or an index/sector proxy actually took over the days immediately before today, so the AI cannot say whether today's move continues, breaks, or sits inside a recent multi-day trend — it can only restate today's figure in isolation. This leaves a real, evidence-backed gap: retail investors are documented to over-extrapolate a single day's move into a persisting trend (recency/overconfidence bias), and the product's own `ANALYSIS_GUIDELINE` already has a rule against that bias (an unusual day is not evidence of a persisting trend) with nothing to back it — no computed recent-history signal for the AI to reason against.

## Solution

Add a new deterministic, pure computation engine, Recent Trend, that classifies a symbol's (or index/sub-sector proxy's) trailing 10-trading-day closing-price behavior as an uptrend, a downtrend, or no-clear-trend, and — when the window contains a confirmed local peak or trough — how many trading days ago that reversal fell. Feed this into Today's Story's "Unusual vs. History" card and Market Story's "Volatility & Context" card only, alongside the existing reasoning those cards already do, with new guideline principles instructing the AI to place today's move against the trailing trend without predicting where it goes next. No new data collection, upstream call, cron job, or schema change is required — the engine runs entirely on `daily_closes` history already loaded for other purposes.

## User Stories

1. As a visitor reading a stock's "Unusual vs. History" card, I want to know whether today's move continues, reverses, or sits inside a trend that was already underway, so I don't mistake a single unusual day for a new trend or miss that it's actually a continuation.
2. As a visitor, I want to know how many trading days ago the most recent reversal happened (when one did), so I can judge how fresh or how stale the current trend is.
3. As a visitor, I want to see the net percent change over the trailing 10 trading days, so I have a concrete number for "recent" rather than only a qualitative label.
4. As a visitor reading Market Story's "Volatility & Context" card, I want to know whether today's volatility reading continues or breaks the Volatility proxy's own recent trend, so I can judge whether today's calm/turbulence is a new development or part of an ongoing pattern.
5. As a visitor, I do not want the recent-trend read to imply where the trend goes next, so the product stays within its "what happened" scope and doesn't cross into prediction.
6. As a visitor viewing a Top-20 stock with less than 10 trading days of history, I want the card to say the recent-trend read is unavailable rather than show a wrong or guessed direction, so I'm never shown a fabricated signal. This state is verified with fixtures, without extending deep analysis to the 23 extended stocks.
7. As a visitor, I want the closing Market Story card named "Market Takeaway" to match its existing cross-section synthesis, while Recent Trend reasoning stays in "Volatility & Context."
8. As the project owner, I want the AI never to derive today's-vs-trend reasoning from an unconfirmed swing (a reversal that happened yesterday or today, with no follow-through days yet to confirm it), so the product doesn't assert a reversal that hasn't actually held.
9. As the project owner, I want this signal computed the same way every other analytical input already is — a pure function with no database import, feeding a JSON field the AI narrates but never calculates — so it doesn't create a second pattern to maintain alongside `volatility.ts`/`movement-classification.ts`/`peer-comparison.ts`.
10. As the project owner, I want the reasoning to reuse `daily_closes` data already loaded for YTD/MTD and volatility-percentile computation, so this feature adds zero new upstream calls, cron jobs, or query round-trips.
11. As the project owner, I want the recent-trend fallback to `null`/"not available" fields (not a guessed value) whenever fewer than 10 trading days of history exist, matching the existing degrade-honestly pattern used by `fundamentals: null` and volatility's own null-percentile case.
12. As the project owner, I want the "why this window is 10 trading days" and "why closing prices instead of intraday day-high/day-low" decisions recorded as an ADR, so a future reader doesn't wonder why a more precise-sounding method wasn't used, and doesn't propose reversing it without first reading why.
13. As the project owner, I want "Recent Trend" added to the project's domain glossary (`CONTEXT.md`) with its `_Avoid_` synonyms, so future work uses one consistent term instead of drifting to "short-term trend," "momentum," or "signal."
14. As the project owner, I want a documented (not built) follow-up note next to `computeSectorAverages` about a possible future rolling multi-day sector-average trend, so the idea isn't lost but also isn't half-built against data (the 23 extended symbols' history) that isn't deep enough yet.
15. As the project owner, I want Today's Story's existing `NO_UNUSUALNESS` fallback condition left exactly as-is (still gated on volatility percentile / range position availability, not on Recent Trend's own availability), so a stock with valid volatility data but insufficient trend history doesn't lose its whole "Unusual vs. History" card.
16. As the project owner, I want no changes to `timeline.ts`, `daily-summary.ts`, or `intraday_snapshots` retention, so this feature stays fully decoupled from the existing (and unrelated) intraday session-high/session-low computation.

## Implementation Decisions

- New pure computation engine (no database import): given a symbol's (or index/proxy's) closing-price history, sort by trading day, take the trailing 10-trading-day window, and classify it as `uptrend` / `downtrend` / `no-clear-trend`, plus the net percent change across the window and — when a confirmed local peak/trough exists inside the window — how many trading days ago it fell. All fields are `null` (except a raw days-available count) when fewer than 10 trading days of history exist.
- Reversal detection uses closing prices only, via the standard "5-bar swing" convention: a day qualifies as a local peak/trough only when it is strictly higher/lower than the 2 trading days on either side. This is a documented, deliberate simplification — `daily_closes` has no day-high/day-low columns, and `intraday_snapshots` (which does carry intraday highs/lows) is pruned after 7 days, far short of the 10-day window needed. Recorded as an ADR.
- Direct consequence of the 2-day confirmation arm: a reversal can never be reported as having happened "0" or "1" trading days ago — the earliest a reversal can be confirmed is 2 trading days after it occurred. This is intentional (an unconfirmed swing is not asserted as a reversal) and must be documented inline, not treated as a defect.
- The "no clear trend" cutoff (used when no swing exists inside the window and the net window change is too small to call a direction) is a small, explicitly named threshold with a documented rationale, matching how the existing significance rule names and documents its own thresholds — not an unexplained magic number.
- No 4th "just reversed" label state is added; the reversal-recency number already carries that nuance, and duplicating it as a second label would let the input contradict itself.
- Today's Story: the engine's output is composed into the existing per-stock structured-input assembler (alongside peers/sector/market/volatility/fundamentals/news), using the `daily_closes` history that assembler already receives — no new query. The narrative's "Unusual vs. History" card's instruction is extended to reason about the trend/reversal figure together with the existing volatility-percentile/range-position figures, stating explicitly that this is a backward-looking placement, never a forward-looking claim. The card's existing "no data" fallback condition is unchanged (still gated on volatility data, not on this new field).
- The reasoning-method guideline document (the numbered "how to reason" principles feeding the prompt) gains one new principle: read today against the trailing trend before treating today's figure as standalone, explicitly distinguished from the existing "an unusual day is not evidence of a future trend" principle (that one forbids forward projection; the new one enables backward placement).
- Market Story: the engine runs the same way over each of the 6 index/sub-sector proxies' already-loaded closing-price history and is stored alongside each proxy's existing volatility-percentile/range data. Only the "Volatility & Context" card's instruction is extended, to reason about the Volatility proxy's own trailing trend alongside its existing volatility-percentile figure. Rename the closing card to "Market Takeaway" while leaving `closingSynthesis` and its existing cross-section synthesis instruction and XLK YTD chart untouched. The other 5 proxies' trend figures are available in the input but reserved for future work, not other sections in this pass.
- Market Story's equivalent reasoning-guideline document gains the matching new principle, scoped to proxy-level trend rather than single-stock trend, distinguished from its own existing "a single day's reading doesn't predict a persisting trend" principle the same way.
- Explicitly deferred, documented as a code comment near the sector-averaging computation rather than built: a rolling multi-day sector-average trend across all 43 tracked stocks. This needs new aggregation logic (not a reuse of anything existing) and depends on the 23 recently-added tracked symbols accumulating more `daily_closes` history than they currently have.
- New ADR recorded: why recent-trend detection uses closing prices rather than intraday day-high/day-low, and under what condition (new stored day-high/day-low columns) it would be worth revisiting.
- New domain-glossary entry for "Recent Trend" in `CONTEXT.md`, with an `_Avoid_` list steering future work away from "short-term trend," "momentum," and "signal" as synonyms.

## Testing Decisions

- Good tests here exercise external behavior (given a closing-price history, what direction/reversal/window-change does the engine report), not internal implementation steps.
- Primary/highest seam: the new engine itself, tested directly with hand-picked closing-price scenarios — this is the seam with enough resolution to exercise the swing algorithm's real edge cases (a V-shape, an inverted V, a flat window, ties at a would-be swing point, unsorted input, fewer than 10 days of history, more than 10 days supplied). A higher seam (the story/market-story input assemblers) cannot exercise these without reconstructing the same scenarios anyway.
- Prior art for this seam: every other pure computation engine in this codebase (`volatility.ts`, `movement-classification.ts`, `period-performance.ts`, `peer-comparison.ts`) is tested this same way — direct unit tests against hand-picked inputs, no database, no mocking.
- Secondary seam, matching existing convention exactly: the per-stock and per-market-proxy input assemblers each get one additional wiring assertion (the new field is populated on a normal input, and degrades to `null`/"not available" on an empty closing-price history) — the same pattern those assemblers already use for every other engine they compose (e.g. the existing empty-history assertion for the volatility fields).
- Not covered by either seam, consistent with existing precedent in this codebase: the AI prompt text itself has no automated test (this codebase's existing convention is a manual generation run + human read of the output, not a snapshot test of prompt strings); the database read/write layer (this repo has no isolated test database, and local runs already write to production — a pre-existing, accepted tradeoff, not something this feature changes).

## Out of Scope

- Any schema or migration change (no new columns, no new tables).
- Extending `intraday_snapshots` retention or adding day-high/day-low storage to `daily_closes`.
- Any new upstream API call or cron schedule change.
- A rolling multi-day sector-average trend for Market Story's "Sector Leadership" card (documented as a future follow-up only).
- A second, "unconfirmed possible reversal" signal alongside the confirmed one.
- Any change to `timeline.ts`, `daily-summary.ts`, or the existing (unrelated) intraday session-high/session-low computation.
- Renaming any existing heading except the approved "Year-to-Date Context" → "Market Takeaway" change.
- Extending Market Story's "Standout Movers" or "Market Takeaway" cards' instructions to use this signal (the per-proxy figures remain available in the input for a possible future pass, but no section instruction references them beyond "Volatility & Context" in this spec).
- A second, isolated test database.
- Backfilling or retroactively regenerating past days' narratives with the new signal.

## Further Notes

- This feature was scoped through a multi-round design conversation (not a single research pass): one pass established the 10-trading-day window and the 2-day "5-bar swing" convention from technical-analysis prior art; a second pass grounded the *reason* this matters in documented retail-investor behavior (recency/overconfidence bias, disposition effect — Barber & Odean and related investor-research-workflow sources), which is why the guideline principle is framed as "place today against the trend," not as a generic technical indicator bolted on for its own sake.
- The single biggest algorithmic caveat, worth restating for whoever implements this: the 2-trading-day confirmation lag means the engine structurally cannot report a reversal fresher than 2 trading days old. This was discussed explicitly and accepted as correct behavior (avoids asserting an unconfirmed reversal), not something to "fix" by loosening the swing-detection arm.
- Recent Trend remains in Volatility & Context only. Subsequent code inspection found that the old "Year-to-Date Context" heading already covered a broader synthesis; the owner approved renaming it "Market Takeaway" without changing that section's prompt or chart.
