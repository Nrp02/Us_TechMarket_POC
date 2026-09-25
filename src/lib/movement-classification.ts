// Company-specific vs. market-wide classification, from the divergence figures
// computeDivergence() already produced. Pure and free of any database import,
// same reason peer-comparison.ts is.

export type MovementClassification = "company-specific" | "market-wide" | "unknown";

// A move that tracks the market within this many points reads as market-wide
// regardless of direction; anything wider is attributed to the company.
const DIVERGENCE_THRESHOLD_PCT = 2;

/**
 * `vsMarketPercent` is null when the market proxy hasn't been fetched yet this
 * session (see Divergence.vsMarketPercent) — that state is genuinely unknown,
 * not a value to guess a classification for.
 */
export function classifyMovement(vsMarketPercent: number | null): MovementClassification {
  if (vsMarketPercent === null) return "unknown";
  return Math.abs(vsMarketPercent) >= DIVERGENCE_THRESHOLD_PCT ? "company-specific" : "market-wide";
}
