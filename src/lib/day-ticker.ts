// The historical counterpart to readLiveTickers in session.ts. "Today"
// keeps reading price_cache (a live-only cache with no history) exactly as
// before; this builds the same Ticker shape for any of the previous 6
// trading days from already-loaded rows — no DB import here, so it's
// testable the same way period-performance.ts/timeline.ts are.
//
// Volume semantics were verified against real stored data before writing
// this: intraday_snapshots.volume is per-bar (each 15-minute bar's own
// traded volume), not a cumulative running total — summing a day's bars
// reproduced NVDA's real daily volume (60-88M across 5 sample days, each
// non-monotonic), so a day whose close carries no stored volume uses that
// sum, never "the last bar" (which would be true if the feed were cumulative,
// and is not).

import { isSignificant, relativeVolume, significanceScore } from "./significance.ts";
import type { Ticker } from "./session.ts";

export type DayCloseRow = {
  close: number;
  change: number;
  changePercent: number;
  /** Stored with the close (migration 0021); null on rows written before it. */
  volume: number | null;
  avgVolume: number | null;
};

/**
 * Relative volume only ever divides by the average stored with that session's
 * close. There is no other historical average: dividing by today's would let a
 * past day's Significant badge change after the fact, so a close stored
 * without one reports relative volume as unknown.
 */
export function buildDayTicker(params: {
  symbol: string;
  name: string;
  dailyClose: DayCloseRow | null;
  /** That day's per-bar volumes, summed only when the close carries no volume. */
  snapshotVolumes: number[];
  /** That day's intraday prices, oldest first. */
  sparkPrices: number[];
}): Ticker | null {
  const { symbol, name, dailyClose, snapshotVolumes, sparkPrices } = params;
  if (!dailyClose) return null;

  const volume = dailyClose.volume ?? (snapshotVolumes.length
    ? snapshotVolumes.reduce((sum, v) => sum + v, 0)
    : null);
  const relVolume = relativeVolume(dailyClose.volume, dailyClose.avgVolume);

  return {
    symbol,
    name,
    price: dailyClose.close,
    change: dailyClose.change,
    changePercent: dailyClose.changePercent,
    volume,
    relativeVolume: relVolume,
    avgVolume: dailyClose.avgVolume,
    significant: isSignificant(dailyClose.changePercent, relVolume),
    score: significanceScore(dailyClose.changePercent, relVolume),
    spark: sparkPrices,
  };
}
