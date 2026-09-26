// Whole-market aggregate stats over the Top 20 — how many advanced vs.
// declined, how many cleared the existing Significant Movement rule, each
// sector's average move, and the biggest individual gainers/losers. Pure
// functions over already-computed ticker data (no new formula, no upstream
// call); feeds SessionDigest's breadth bar, Market Story's Groq prompt
// (market-story-input.ts), and Market Story's Standout Movers/Sector
// Leadership charts (market-story.tsx) — the same three consumers reading
// the same numbers.

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

export type SectorAverage = {
  sector: string;
  averageChangePercent: number;
  count: number;
  /** Each sector member's own changePercent, highest first — lets a reader (or Market Story's prompt) name the specific stock leading or lagging within the sector rather than only the average. */
  stocks: { symbol: string; changePercent: number }[];
};

/** Averages `changePercent` within each of SECTOR_BY_SYMBOL's buckets — a symbol outside the map is skipped, not fabricated a sector. */
export function computeSectorAverages(
  tickers: { symbol: string; changePercent: number }[],
): SectorAverage[] {
  const bySector = new Map<string, { symbol: string; changePercent: number }[]>();
  for (const ticker of tickers) {
    const sector = SECTOR_BY_SYMBOL[ticker.symbol];
    if (!sector) continue;
    const values = bySector.get(sector) ?? [];
    values.push({ symbol: ticker.symbol, changePercent: ticker.changePercent });
    bySector.set(sector, values);
  }

  return [...bySector.entries()].map(([sector, stocks]) => ({
    sector,
    averageChangePercent: stocks.reduce((sum, s) => sum + s.changePercent, 0) / stocks.length,
    count: stocks.length,
    stocks: [...stocks].sort((a, b) => b.changePercent - a.changePercent),
  }));
}

export type TopMover = { symbol: string; changePercent: number };

/** How many of the Top 20's biggest gainers/losers to name individually — an average alone can't say which stock actually drove the day. */
const TOP_MOVERS_COUNT = 3;

/**
 * The 3 biggest gainers and 3 biggest losers among the tracked tickers, each
 * group sorted largest move first. Moved here from market-story-input.ts (it
 * was inlined into buildMarketStoryInput) so the Market Story chart that
 * renders these same figures reads them from the one function the Groq
 * prompt was built from, rather than a second copy that could drift from it
 * — the same reasoning this file's other two exports already follow.
 */
export function computeTopMovers(
  tickers: { symbol: string; changePercent: number }[],
): { gainers: TopMover[]; losers: TopMover[] } {
  const sortedByMove = [...tickers].sort((a, b) => b.changePercent - a.changePercent);
  return {
    gainers: sortedByMove
      .slice(0, TOP_MOVERS_COUNT)
      .map((t) => ({ symbol: t.symbol, changePercent: t.changePercent })),
    losers: sortedByMove
      .slice(-TOP_MOVERS_COUNT)
      .reverse()
      .map((t) => ({ symbol: t.symbol, changePercent: t.changePercent })),
  };
}
