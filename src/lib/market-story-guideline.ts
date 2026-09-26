// A separately-editable set of reasoning principles for Market Story's
// narrative prompt (market-story-generation.ts's buildPrompt) — the
// whole-market counterpart to story-guideline.ts, kept in its own file for
// the same reason: tuning *how the model reasons about a session* shouldn't
// require touching the function that assembles structured JSON input.
//
// Every principle below is restated only in terms of fields already present
// in Market Story's structured input (breadth, sector averages and their
// per-stock breakdown, index/sub-sector proxy moves and their own
// volatility-percentile/range-position history, the Top 20's individual
// biggest movers, macro releases, FOMC-day flag, market news) — same
// "method, not a new exception to the hard rules" posture as story-guideline.ts.
//
// Sourced from one holistic web-research pass (same agreed scope as
// story-guideline.ts: not per-section, not a literature review) on how
// market breadth, sector rotation and volatility are read together in daily
// commentary: the breadth-thrust / advance-decline framing on market
// internals and participation (stockcharts.com ChartSchool, Wikipedia's
// "Advance-Decline Data"); sector rotation as a breadth lens on where
// strength really sits (medium.com/@ajayprhrrr0321's "Sector Rotation
// Through a Breadth Lens"); and the risk-on/risk-off framing of volatility
// and investor positioning (britannica.com/money "Risk-On vs. Risk-Off").
// The VIX-specific numeric bands from that research (e.g. "above 20 is
// elevated") are deliberately NOT restated below — VIXY tracks VIX
// *futures*, not VIX spot (see symbols.ts), so a spot-VIX threshold doesn't
// transfer, and CLAUDE.md's rule against inventing a number applies to a
// threshold as much as to a fact.
export const MARKET_ANALYSIS_GUIDELINE = `Analysis guideline — how to reason about a whole session, not just what to state:

1. Breadth before the index level: before describing the day by how far the
   index/sub-sector proxies moved, check whether that move was broad (many
   advancers, a high significant count) or narrow (a few standout movers
   carrying it). A proxy's gain built on broad participation is a different,
   more durable-reading session than the same gain built on one or two names —
   say which one the data shows, don't just report the proxy figure.

2. Sector rotation is a pattern, not a single average: when sector averages
   diverge, that is itself information about where strength or weakness
   concentrated today. Name the leading and lagging sector, and where a
   sector's own stock breakdown shows one member diverging from its peers
   within that sector, say so rather than only citing the group average.

3. Distinguish a standout mover from the group it sits in: a single Top 20
   stock's large move is a different, more specific observation than "the
   sector was strong" — check whether the Top 20 movers list and the sector
   averages agree before treating one stock's move as representative of its
   whole sector.

4. Read volatility together with breadth, not alone: the Volatility (VIXY)
   proxy's move means something different depending on whether breadth was
   broad or narrow, positive or negative, the same day. Connect the two
   rather than describing the volatility proxy in isolation, and never assign
   it a fixed numeric band (e.g. "elevated," "calm") that isn't itself a
   figure present in the input.

5. State what a macro release or FOMC day does and doesn't explain: a
   scheduled reading or decision day is context for the session, not
   automatically its cause. Say plainly when the breadth/sector/proxy data
   doesn't line up with what the macro context would suggest, rather than
   forcing a connection.

6. A single day's breadth or volatility reading describes today, not a
   persisting trend: a narrow session or a calm/turbulent proxy reading is a
   fact about this session only. Never let a strongly-worded description of
   today drift into implying it will continue.

7. A conclusion needs two data points, not one: don't translate a single
   figure into a sentence and call it analysis. Connect at least two pieces
   of the input (e.g. a sector average with its own standout member, breadth
   with the volatility proxy, a macro reading with sector leadership) before
   it counts as reasoning rather than a re-worded number.

8. Place VIXY's move against its own Recent Trend in "volatilityContext"
   only: connect today's proxy move to its supplied 10-trading-day
   closing-price direction, net change, and confirmed reversal age. Explain
   continuation, interruption, or no clear trend, never a forecast. Compare
   today against the supplied direction, not the net change of the whole
   window, which can have a different sign. Rule 6 forbids projecting today's
   reading forward; this rule places it against
   the past. VIXY tracks VIX futures, not spot VIX. A reversal needs two
   later trading days to confirm; unavailable history or an unconfirmed
   reversal must never become a guessed signal. The other proxies' trend
   fields are reserved for future work, not other sections in this pass.`;
