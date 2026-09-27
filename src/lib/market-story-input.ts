// Composes breadth, sector averages, index/sub-sector proxy moves, macro
// data and the day's Market News into one payload for the Market Story
// Groq call — the whole-market counterpart to story-input.ts. Pure and free
// of any database import, same reason every engine it calls is: the caller
// loads the day's data first and passes it in.
//
// Every field is a number or a value from a fixed label set, never free
// text (aside from news headlines/summaries, passed through verbatim for
// the model to read, exactly as story-input.ts already does for Today's
// Story) — phrasing that into prose is the narrative call's job, not this
// one's.

import { isFomcDay, mostRecentDecision } from "./fomc-calendar.ts";
import { FRED_SERIES } from "./fred.ts";
import { TOP_20_SYMBOLS, TRACKED_STOCK_SYMBOLS } from "./symbols.ts";
import { computeRecentTrend, type RecentTrend } from "./trend-detection.ts";
import {
  computeBreadth,
  computeSectorAverages,
  computeTopMovers,
  type SectorAverage,
  type TopMover,
} from "./market-breadth.ts";
import { computeRangePosition, computeVolatilityPercentile, type RangeLabel } from "./volatility.ts";

const SERIES_LABEL: Record<string, string> = {
  [FRED_SERIES.cpi]: "CPI (all urban consumers)",
  [FRED_SERIES.unemployment]: "Unemployment rate",
  [FRED_SERIES.gdp]: "Real GDP",
  [FRED_SERIES.fedFundsRate]: "Fed funds rate",
};

export type MarketStoryNewsItem = {
  headline: string;
  summary: string | null;
  sourceText?: string | null;
  sourceUrl: string;
  publishedAt: string;
};

export type MarketStoryMacroRow = {
  seriesId: string;
  latestDate: string;
  latestValue: number | null;
  priorDate: string | null;
  priorValue: number | null;
};

/** One daily_closes row for an index/sub-sector proxy — same shape story-generation.ts's loadDailyCloses already reads per stock, here loaded for all of INDEX_SYMBOLS in one query. */
export type MarketStoryIndexClose = {
  symbol: string;
  tradingDay: string;
  close: number;
  changePercent: number | null;
};

export type MarketStoryInputParams = {
  day: string;
  /** Tracked stock changePercent/significant — same Ticker fields computeBreadth/computeSectorAverages already read. */
  trackedStocks: { symbol: string; changePercent: number; significant: boolean; relativeVolume?: number | null }[];
  /** INDEX_CARDS' own tickers (NASDAQ/S&P/Dow/Tech/Volatility/Semiconductors), plus today's price so a range position can be computed against indexDailyCloses. */
  indices: { label: string; symbol: string; changePercent: number; price: number }[];
  /** Each proxy's own trailing history (up to 370 days, daily_closes' own retention) — backs the same "how unusual vs. its own past year" read story-input.ts already gives individual stocks. */
  indexDailyCloses: MarketStoryIndexClose[];
  /** Whatever macro_indicators currently holds — absent entirely before the first ingestion cycle. */
  macro: MarketStoryMacroRow[];
  news: MarketStoryNewsItem[];
};

export type MarketStoryIndex = {
  label: string;
  symbol: string;
  changePercent: number;
  volatilityPercentile: number | null;
  rangePosition: number | null;
  rangeLabel: RangeLabel | null;
  recentTrend: RecentTrend;
};

export type MarketStoryInput = {
  day: string;
  coverage: { availableStocks: number; expectedStocks: number };
  significanceVolumeCoverage: { knownTop20: number; totalTop20: number };
  breadth: ReturnType<typeof computeBreadth>;
  sectorAverages: SectorAverage[];
  indices: MarketStoryIndex[];
  topMovers: { gainers: TopMover[]; losers: TopMover[] };
  macro: {
    seriesLabel: string;
    latestDate: string;
    latestValue: number | null;
    priorDate: string | null;
    priorValue: number | null;
  }[];
  fomc: { isDecisionDayToday: boolean; mostRecentDecisionDay: string | null };
  news: MarketStoryNewsItem[];
};

export function buildMarketStoryInput(params: MarketStoryInputParams): MarketStoryInput {
  const { day, trackedStocks, indices, indexDailyCloses, macro, news } = params;

  const topMovers = computeTopMovers(trackedStocks);

  const indicesWithVolatility: MarketStoryIndex[] = indices.map((index) => {
    const closes = indexDailyCloses.filter((row) => row.symbol === index.symbol);
    // Today's own row (if already stored) must not count as history for its own percentile rank — same guard story-input.ts applies per stock.
    const historicalChangePercents = closes
      .filter((row) => row.tradingDay !== day && row.changePercent !== null)
      .map((row) => row.changePercent as number);
    const rangePosition = computeRangePosition(index.price, closes.map((row) => row.close));
    return {
      label: index.label,
      symbol: index.symbol,
      changePercent: index.changePercent,
      volatilityPercentile: computeVolatilityPercentile(index.changePercent, historicalChangePercents),
      rangePosition: rangePosition.position,
      rangeLabel: rangePosition.label,
      recentTrend: computeRecentTrend(closes),
    };
  });

  return {
    day,
    coverage: { availableStocks: trackedStocks.length, expectedStocks: TRACKED_STOCK_SYMBOLS.length },
    significanceVolumeCoverage: {
      knownTop20: trackedStocks.filter((t) => TOP_20_SYMBOLS.includes(t.symbol) && t.relativeVolume != null).length,
      totalTop20: trackedStocks.filter((t) => TOP_20_SYMBOLS.includes(t.symbol)).length,
    },
    breadth: computeBreadth(trackedStocks, trackedStocks.filter((t) => TOP_20_SYMBOLS.includes(t.symbol))),
    sectorAverages: computeSectorAverages(trackedStocks),
    indices: indicesWithVolatility,
    topMovers,
    macro: macro.map((row) => ({
      seriesLabel: SERIES_LABEL[row.seriesId] ?? row.seriesId,
      latestDate: row.latestDate,
      latestValue: row.latestValue,
      priorDate: row.priorDate,
      priorValue: row.priorValue,
    })),
    fomc: {
      isDecisionDayToday: isFomcDay(day),
      mostRecentDecisionDay: mostRecentDecision(day),
    },
    news,
  };
}
