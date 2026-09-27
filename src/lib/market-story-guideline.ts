// Market interpretation principles, separate from engine input assembly.
// Method: CFA Institute Standards V(A), V(B): reasonable basis, fact/opinion
// distinction and limitations. These establish no numeric trading thresholds.
// Source notes and live experiments: .scratch/narrative-audit/prompt-research.md.
export const MARKET_ANALYSIS_GUIDELINE = `Reasoning guideline:
- Breadth before index direction: compare participation and concentration to
  distinguish broad gains/losses from a few outliers. This is sample breadth.
  Unweighted sample breadth cannot establish weighted index contributions or
  prove that heavyweights did not dominate an index move.
  Significant count is detected signals under the supplied rule; missing volume
  leaves its volume branches unassessed. Zero does not prove no outsized moves.
- Sector averages require corroboration from named members. Differences show
  where returns concentrated, not observed money flows or investor motives.
- Separate a standout stock from its group; do not make it the whole sector.
- Read VIXY's move with breadth and index magnitude. It is a futures proxy,
  not spot VIX; do not import spot-VIX numeric thresholds.
  Its ETF price/range position does not measure an absolute volatility level,
  the futures curve or fear: roll effects and product path matter.
- Macro/news provides possible mechanisms, not automatic causes. Assess
  timing and whether sector/proxy patterns fit; name contradictions.
  Standard financial relationships may explain a conditional channel, not
  establish a new release, measured sensitivity or investor behavior.
- Connect evidence to an inference: explain why the relationship favors a
  particular account, consider a credible alternative, state the residual.
  Two numbers together are still restatement without that explanation.
- A missing numeric release snapshot does not mean no macro release happened.
  Separate an observation period, a publication date and a scheduled FOMC day.
- One day's participation is not a persistent trend. VIXY Recent Trend belongs
  only in volatilityContext; use direction, not net-window-change sign, for
  today's comparison. No-clear-trend is unavailable direction, not flat.
  Reversals need two later sessions; missing age is not zero/no prior swings.`;
