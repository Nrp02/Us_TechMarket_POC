// A separately-editable set of reasoning principles for Today's Story's
// narrative prompt (story-generation.ts's buildPrompt), kept out of that
// function so tuning *how the model reasons* never requires touching the
// function that assembles structured JSON input — two different kinds of
// change with different edit frequency and risk.
//
// Every principle below is restated only in terms of fields already present
// in Today's Story's structured input (price, volume, peers, sector/market
// divergence, volatility percentile, 52-week range, YTD/MTD, fundamentals
// growth/surprise, news) — deliberately scoped to avoid a reasoning pattern
// that needs data the product doesn't have (P/E ratios, analyst consensus,
// technical indicators). This is *method*, not a new exception to the hard
// rules (no invented facts, no new numbers, no predictions, no investment
// advice, no repeating an earlier section's conclusion) — those remain
// wherever buildPrompt states them.
//
// Sourced from one holistic web-research pass (not per-section, not a deep
// literature review — an agreed scope for a school-project timeline) on how
// equity analysts approach daily stock commentary: MarketSmith's "When
// everything is weak, ask what the comparison really says," "The first
// question is not which stock is strongest," and "The chart that survives
// alone may be asking for more work" (marketsmithin.substack.com); and
// StockCharts.com's ChartSchool entry on Price Relative/Relative Strength.
export const ANALYSIS_GUIDELINE = `Analysis guideline — how to reason, not just what to state:

1. Context before attribution: before making any claim about the company
   specifically, first establish what its peers, sector, or the market did.
   Look at the group before the stock.

2. A lone divergence needs corroboration, not just observation: if this
   stock's move diverges from its peers or sector, treat that divergence as a
   signal, not proof of genuine company-specific strength. Check whether
   volume, fundamentals, or news corroborate it. If nothing else corroborates
   it, say so plainly rather than calling it a settled read.

3. State what an explanation covers and what it leaves open: when connecting
   news, fundamentals, or peer/sector behavior to the day's move, be explicit
   about which part of the data the explanation accounts for and which part
   (if any) it doesn't. A partial, honest account beats a complete-sounding
   one that quietly ignores a data point that doesn't fit.

4. Describe before you attribute cause: default to descriptive, observational
   phrasing (what happened, how it compares, how unusual it is) as the primary
   claim in every section. Causal language is a secondary layer, used only
   where the input actually supports it.

5. An unusual day is not evidence of a persisting trend: a volatility
   percentile, a relative-volume figure, or a large price move describes
   today, not tomorrow. Never let a strongly-worded description of an unusual
   day drift into implying it will continue.

6. A conclusion needs two data points, not one: don't translate a single
   input value into a sentence and call it analysis — that is restatement.
   Every section's conclusion must connect at least two different pieces of
   the input (e.g. a peer figure with a news item, a volume figure with a
   volatility percentile, one peer's own move with the peer average) before
   it counts as reasoning rather than a re-worded number.

7. Name the peer, not just the group: when peer data supports it, say which
   specific peer moved with or against this stock, using its own figure —
   not only the peer average. A single outlier inside an otherwise flat peer
   group is a different, more specific observation than "peers were mixed."

8. Business facts persist between releases: use the latest known earnings
   and growth figures as context on every session, without presenting them as
   fresh news. Reconcile quarterly growth versus TTM growth with today's
   stock/peer performance. A mismatch describes tension; it does not prove
   the business deteriorated today or that the market mispriced it. Missing
   numerical results do not erase business evidence in company news.

9. Place today against Recent Trend in "unusualness": when the supplied
   10-trading-day closing-price trend is available, connect today's move to
   that direction, net window change, and confirmed reversal age. Distinguish
   continuation, a move against the trend, and no clear trend without
   calculating new figures. Compare today to the supplied direction, not
   the net window change: those can have opposite signs because direction
   reads swing structure or the latest leg. Rule 5 forbids projecting today
   forward; this rule places today against the past. Two later trading days are needed to
   confirm a reversal, so never infer an unconfirmed one. Unavailable trend
   history is a limitation to state, not a direction to guess.`;
