// Whole-market aggregate stats over the Top 20 — how many advanced vs.
// declined, how many cleared the existing Significant Movement rule, and
// each sector's average move. Pure functions over already-computed ticker
// data (no new formula, no upstream call); feeds SessionDigest today and
// Market Story's breadth/sector-leadership sections later (ticket 07).

import { SECTOR_BY_SYMBOL } from "./symbols.ts";

export type BreadthInput = { changePercent: number; significant: boolean };

export type MarketBreadth = {
  advancers: number;
  decliners: number;
  unchanged: number;
  total: number;
  significantCount: number;
};

export function computeBreadth(tickers: BreadthInput[]): MarketBreadth {
  const advancers = tickers.filter((t) => t.changePercent > 0).length;
  const decliners = tickers.filter((t) => t.changePercent < 0).length;
  return {
    advancers,
    decliners,
    unchanged: tickers.length - advancers - decliners,
    total: tickers.length,
    significantCount: tickers.filter((t) => t.significant).length,
  };
}

export type SectorAverage = { sector: string; averageChangePercent: number; count: number };

/** Averages `changePercent` within each of SECTOR_BY_SYMBOL's buckets — a symbol outside the map is skipped, not fabricated a sector. */
export function computeSectorAverages(
  tickers: { symbol: string; changePercent: number }[],
): SectorAverage[] {
  const bySector = new Map<string, number[]>();
  for (const ticker of tickers) {
    const sector = SECTOR_BY_SYMBOL[ticker.symbol];
    if (!sector) continue;
    const values = bySector.get(sector) ?? [];
    values.push(ticker.changePercent);
    bySector.set(sector, values);
  }

  return [...bySector.entries()].map(([sector, values]) => ({
    sector,
    averageChangePercent: values.reduce((sum, v) => sum + v, 0) / values.length,
    count: values.length,
  }));
}
