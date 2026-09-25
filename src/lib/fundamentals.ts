// Classifiers over the `fundamentals` table's stored fields (migration 0011).
// Pure and free of any database import, same reason peer-comparison.ts is —
// callers pass in the row's own numbers rather than this module reading them.

export type EarningsSurprise = "beat" | "miss" | "inline" | "unknown";
export type GrowthTrend = "accelerating" | "decelerating" | "stable" | "unknown";

// A surprise within this many points of zero reads as inline — earnings
// beats/misses are reported with real noise around an exact match.
const SURPRISE_INLINE_THRESHOLD_PCT = 2;

// Quarterly growth within this many points of the TTM figure reads as stable.
const GROWTH_TREND_THRESHOLD_PCT = 2;

/**
 * `latestEarningsSurprisePercent` is null when `fundamentals` has no row yet
 * for the symbol (not yet refreshed) or Finnhub's earnings endpoint had
 * nothing to report — genuinely unknown, not "inline".
 */
export function classifyEarningsSurprise(latestEarningsSurprisePercent: number | null): EarningsSurprise {
  if (latestEarningsSurprisePercent === null) return "unknown";
  if (latestEarningsSurprisePercent >= SURPRISE_INLINE_THRESHOLD_PCT) return "beat";
  if (latestEarningsSurprisePercent <= -SURPRISE_INLINE_THRESHOLD_PCT) return "miss";
  return "inline";
}

/**
 * Whether the most recent quarter's growth is running hotter or cooler than
 * the trailing-twelve-month figure. Works for either EPS or revenue growth —
 * callers pass whichever pair of `fundamentals` columns they're narrating.
 *
 * Either figure missing yields "unknown" rather than comparing a real number
 * against a stand-in zero.
 */
export function classifyGrowthTrend(
  quarterlyGrowthYoY: number | null,
  ttmGrowthYoY: number | null,
): GrowthTrend {
  if (quarterlyGrowthYoY === null || ttmGrowthYoY === null) return "unknown";

  const delta = quarterlyGrowthYoY - ttmGrowthYoY;
  if (delta >= GROWTH_TREND_THRESHOLD_PCT) return "accelerating";
  if (delta <= -GROWTH_TREND_THRESHOLD_PCT) return "decelerating";
  return "stable";
}
