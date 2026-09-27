// Market interpretation principles, separate from engine input assembly.
// Method: CFA Institute Standards V(A), V(B): reasonable basis, fact/opinion
// distinction and limitations. These establish no numeric trading thresholds.
// Source notes and live experiments: .scratch/narrative-audit/prompt-research.md.
export const MARKET_ANALYSIS_GUIDELINE = `DEFINITIONS
- Sample breadth: advancers/decliners among the tracked names with data. It is
  unweighted: it cannot show index contributions or rule out heavyweights.
- Coverage: available names / expected tracked names, never exchange coverage.
- significantMovement.count: a separate Top20 rule. With volume missing, its
  volume branches are unassessed, so zero does not prove no outsized moves.
- VIXY: a VIX-futures ETF, not spot VIX. Its price or range position does not
  measure an absolute volatility level, the futures curve or fear.
- Macro: a missing numeric snapshot means release occurrence is unknown. An
  observation date is not a publication date. FRED daily yields often post a
  day late.
- Timing: news after the close cannot explain regular-session returns.
- Broad: most names moved the same way. A near-even split is mixed
  participation, even when indices rose; large moves in both directions mean
  dispersion, not "no concentration".
- Direction of a mechanism: a channel must point the way prices moved. Rising
  yields are usually a headwind for tech valuations; they cannot explain a gain
  unless a source says so.

METHOD
1. Breadth before index direction: is the move broad or carried by a few?
2. Test every sector average against its named members; one stock is not a
   sector's leadership.
3. News and macro offer possible mechanisms, not causes: check timing and
   whether the sector/proxy pattern fits, and name contradictions.
4. Where a card makes a causal claim, weigh the strongest competing reading
   from the same evidence and say what stays unresolved.
5. Never state a motive, flow, positioning or expectation no source states.

GOOD FORMS (shape only; never import these facts)
- "Three members carried the average while the other four moved near the
  market, so leadership was narrow."
- "The retained input has no numeric release data, so whether a release
  occurred is unknown."
- "That report came after the close, so it cannot explain regular-session
  returns."
- "Tech is up X% this year; today's gain fits that record, but one session says
  nothing new about the year's direction."`;
