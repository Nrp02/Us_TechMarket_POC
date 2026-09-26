// Recent Trend over already-loaded daily_closes. Pure, like volatility.ts:
// the caller supplies history; this module has no database or provider import.

export type DailyClose = { tradingDay: string; close: number };
export type TrendDirection = "uptrend" | "downtrend" | "no-clear-trend";

export type RecentTrend = {
  direction: TrendDirection | null;
  windowChangePercent: number | null;
  /** Age of the latest confirmed swing used in the direction read, not a forecast. */
  reversalDaysAgo: number | null;
  /** All supplied closes, before selecting the trailing window. */
  daysAvailable: number;
};

const WINDOW_SIZE = 10;
const SWING_ARM = 2;
// Product judgment: a swing-free window moving less than 1% is too flat to
// call a direction. This cutoff does not override a confirmed swing/leg read.
const FLAT_THRESHOLD_PCT = 1;

/**
 * Sort without mutating the caller, then read the trailing ten trading days.
 * Strict 5-bar swings need two trading days on each side: today's/yesterday's
 * turning points cannot be confirmed. The youngest reported reversal is two
 * trading days old; this deliberate lag prevents asserting an unconfirmed one.
 * Compare peaks with peaks and troughs with troughs, never unlike extremes.
 */
export function computeRecentTrend(rows: DailyClose[]): RecentTrend {
  const daysAvailable = rows.length;
  if (daysAvailable < WINDOW_SIZE) {
    return { direction: null, windowChangePercent: null, reversalDaysAgo: null, daysAvailable };
  }

  const window = [...rows]
    .sort((a, b) => a.tradingDay.localeCompare(b.tradingDay))
    .slice(-WINDOW_SIZE);
  const latest = window[WINDOW_SIZE - 1].close;
  const windowChangePercent = ((latest - window[0].close) / window[0].close) * 100;
  const peaks: number[] = [];
  const troughs: number[] = [];
  for (let i = SWING_ARM; i < WINDOW_SIZE - SWING_ARM; i++) {
    const neighbors = [window[i - 2], window[i - 1], window[i + 1], window[i + 2]];
    if (neighbors.every((row) => window[i].close > row.close)) peaks.push(i);
    if (neighbors.every((row) => window[i].close < row.close)) troughs.push(i);
  }

  let direction: TrendDirection = "no-clear-trend";
  let reversalDaysAgo: number | null = null;
  const swingCount = peaks.length + troughs.length;
  if (peaks.length >= 2 && troughs.length >= 2) {
    const peak = peaks[peaks.length - 1];
    const trough = troughs[troughs.length - 1];
    const peakChange = window[peak].close - window[peaks[peaks.length - 2]].close;
    const troughChange = window[trough].close - window[troughs[troughs.length - 2]].close;
    if (peakChange > 0 && troughChange > 0) direction = "uptrend";
    if (peakChange < 0 && troughChange < 0) direction = "downtrend";
    reversalDaysAgo = WINDOW_SIZE - 1 - Math.max(peak, trough);
  } else if (swingCount === 1) {
    const swing = peaks[0] ?? troughs[0];
    const legChange = latest - window[swing].close;
    if (legChange > 0) direction = "uptrend";
    if (legChange < 0) direction = "downtrend";
    reversalDaysAgo = WINDOW_SIZE - 1 - swing;
  } else if (swingCount === 0) {
    if (Math.abs(windowChangePercent) >= FLAT_THRESHOLD_PCT) {
      direction = windowChangePercent > 0 ? "uptrend" : "downtrend";
    }
  }
  // Multiple swings without both same-kind pairs cannot establish HH+HL or
  // LH+LL. Keep no-clear-trend and no claimed reversal used in that read.

  return { direction, windowChangePercent, reversalDaysAgo, daysAvailable };
}
