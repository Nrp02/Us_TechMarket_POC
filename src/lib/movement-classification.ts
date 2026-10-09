// Company-specific vs. sector-wide vs. market-wide classification, from the
// divergence figures computeDivergence() and computePeerComparison() already
// produced. Pure and free of any database import, same reason
// peer-comparison.ts is.

export type MovementClassification = "company-specific" | "sector-wide" | "market-wide" | "unknown";

// A move that tracks a benchmark within this many points reads as moving with
// it regardless of direction; anything wider than every benchmark is
// attributed to the company.
const DIVERGENCE_THRESHOLD_PCT = 2;

const within = (gap: number | null) => gap !== null && Math.abs(gap) < DIVERGENCE_THRESHOLD_PCT;

/**
 * `vsMarketPercent` is null when the market proxy hasn't been fetched yet this
 * session (see Divergence.vsMarketPercent) — that state is genuinely unknown,
 * not a value to guess a classification for. A null sector or peer gap simply
 * can't make the move sector-wide.
 */
export function classifyMovement(
  vsMarketPercent: number | null,
  vsSectorPercent: number | null,
  vsPeersPercent: number | null,
): MovementClassification {
  if (vsMarketPercent === null) return "unknown";
  if (within(vsMarketPercent)) return "market-wide";
  return within(vsSectorPercent) || within(vsPeersPercent) ? "sector-wide" : "company-specific";
}
