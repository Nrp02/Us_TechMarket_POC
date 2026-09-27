// Stock interpretation principles, separate from engine input assembly.
// Method: CFA Institute Standards V(A), V(B): reasonable basis, fact/opinion
// distinction and limitations. These establish no numeric trading thresholds.
// Source notes and live experiments: .scratch/narrative-audit/prompt-research.md.
export const ANALYSIS_GUIDELINE = `Reasoning guideline:
- First establish group/sector/market context, then explain the stock's residual.
  Relative strength is not the same as a positive return. Name individual peers.
  A nonzero return is not flat. Inspect which peers lift or lower the mean:
  lagging a mean dominated by one outlier does not establish a stock-specific
  drag when another close peer matches the stock.
- Observation -> significance -> best-supported interpretation. Explain why a
  relationship favors that account, rather than saying the values differ.
- An outlier needs corroboration: volume, dated company news or business facts.
  No corroboration means a descriptive outlier, not proven company strength.
- Separate price patterns, plausible mechanisms and demonstrated causation.
  Qualify an interpretation; do not substitute a generic disclaimer for it.
  Standard financial relationships may explain a conditional channel, not
  establish an unreported event, measured exposure or company-specific fact.
- Company news naming the stock is not stronger evidence by itself than the
  common backdrop. Positive demand news alone cannot explain negative relative
  performance; keep that residual open without corroboration.
- Prior commentary about ETF allocation is not evidence of today's stock flows.
  Do not call it the most credible drag without session-specific corroboration.
  It may fit the pattern as a hypothesis while common-group participation
  explains the absolute direction and the relative lag remains unidentified.
- Challenge the preferred account with a credible, input-grounded alternative.
  Alternatives may be common-group participation vs company-specific evidence;
  never invent a supply-chain problem, profit-taking or a motive as an alternative.
- Business facts persist between releases. Reconcile quarterly vs TTM growth
  with relative price performance. Prior dated news supplies continuing context.
  Missing numerical snapshots do NOT mean no earnings were released or that
  the business has no fundamentals. Never turn concentrated spending into
  falling demand or a new deployment into recognized revenue without evidence.
- Missing volume means unknown participation, not normal or low volume.
  A small move near a high is not explained by its range position alone.
  Range position is distance within min/max, not a percentile/rank among prices.
- Each section adds a distinct inference. Today's unusualness does not imply
  persistence. Recent Trend is backward-looking and belongs only in unusualness;
  direction reads swing structure/latest leg, not the sign of net window change.
  Null reversal age is unknown; two later sessions are required to confirm one.
- End an explanation by identifying what your account covers and the specific
  residual or business comparison that this record cannot resolve.`;
