// How unusual today's move is against a symbol's own history, and where its
// price sits in its own trailing range. Pure and free of any database import,
// same reason peer-comparison.ts is — both read from daily_closes (up to 370
// rows), supplied by the caller rather than fetched here.

export type RangeLabel = "near-high" | "near-low" | "mid-range";

export type RangePosition = {
  /** 0 = at the trailing low, 1 = at the trailing high. */
  position: number | null;
  label: RangeLabel | null;
};

const RANGE_LOW_THRESHOLD = 1 / 3;
const RANGE_HIGH_THRESHOLD = 2 / 3;

/**
 * Percentile rank (0-100) of |todayChangePercent| against |historicalChangePercents|
 * — the share of the symbol's own past daily moves that today's move meets or
 * beats. Direction doesn't matter here, only magnitude: a -5% day is just as
 * unusual as a +5% one.
 *
 * Null when there's no history yet (a symbol newly added, before a backfill or
 * enough sessions have run) — never a fabricated number standing in for one.
 */
export function computeVolatilityPercentile(
  todayChangePercent: number,
  historicalChangePercents: number[],
): number | null {
  if (historicalChangePercents.length === 0) return null;

  const today = Math.abs(todayChangePercent);
  const atOrBelow = historicalChangePercents.filter((pct) => Math.abs(pct) <= today).length;

  return (atOrBelow / historicalChangePercents.length) * 100;
}

/**
 * Where `price` sits within the min/max of `historicalCloses` (the trailing
 * ~52-week window backing daily_closes), as a 0-1 position plus a fixed label.
 *
 * Null when the range has no width — one stored close, or a flat year where
 * every close is identical — rather than dividing by zero. Also null with no
 * history at all.
 */
export function computeRangePosition(price: number, historicalCloses: number[]): RangePosition {
  if (historicalCloses.length === 0) return { position: null, label: null };

  const min = Math.min(...historicalCloses);
  const max = Math.max(...historicalCloses);
  if (max === min) return { position: null, label: null };

  const position = (price - min) / (max - min);
  const label: RangeLabel =
    position >= RANGE_HIGH_THRESHOLD ? "near-high" : position <= RANGE_LOW_THRESHOLD ? "near-low" : "mid-range";

  return { position, label };
}
