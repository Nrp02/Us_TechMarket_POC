// Stock interpretation principles, separate from engine input assembly.
// Method: CFA Institute Standards V(A), V(B): reasonable basis, fact/opinion
// distinction and limitations. These establish no numeric trading thresholds.
// Source notes and live experiments: .scratch/narrative-audit/prompt-research.md.
export const ANALYSIS_GUIDELINE = `DEFINITIONS
- Backdrop: what XLK, SPY and the named peers did today. Residual: what is
  left of the stock's move after the backdrop.
- Ahead/behind: compare signed returns. A peer that fell less than the stock
  did better, not "lagged". Check every peer before writing "all" or "every".
- Engine label: market-wide when |stock - SPY| < 2 percentage points;
  otherwise sector-wide when |stock - XLK| or |stock - peer mean| < 2;
  otherwise company-specific. A threshold, not a finding about cause.
- Range position: distance within the trailing min/max, not a percentile.
- Recent Trend: backward-looking swing structure. Direction comes from the
  swings, not the sign of the net window change. Swing-point age counts days
  since the swing bar; a reversal needs two later sessions to confirm.
- Timing: news after this session's close cannot explain it; news from before
  this session is continuing context, not a fresh event.
- Missing data (fundamentals, relative volume) is unknown: never "no earnings
  were released", never "normal" or "low" volume.

METHOD
1. Backdrop before residual. Check each named peer, not only the mean: an
   outlier can move the mean while a close peer matches the stock.
2. An explanation needs a dated source or a clear group pattern. A plausible
   channel must be labelled as one; a cause the sources do not state must not
   be asserted. Never state a motive, expectation, flow or positioning.
3. Where a card makes a causal claim, weigh the strongest competing reading
   from the same evidence and say what stays unresolved. A competing reading
   is also bound by rule 2: no investor sentiment, skepticism or motive.
   Any mechanism must point the way the price moved.
4. Business facts persist between releases; old news is context. Price
   strength is not business improvement.

GOOD FORMS (shape only; never import these facts)
- "AMD's +0.22% gain matched the stock, so the lag to the peer mean comes from
  QCOM alone."
- "Relative volume is unavailable, so participation is unknown and cannot
  separate a stock-specific lag from ordinary variation."
- "The gap clears the company-specific threshold, but a close peer fell almost
  as far, so this reads as a group move."
- "Stored growth figures are unavailable. The launch dated [date] is continuing
  context; a market-pace move neither confirms nor rejects it."`;
