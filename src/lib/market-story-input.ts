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
import { computeBreadth, computeSectorAverages, type SectorAverage } from "./market-breadth.ts";

const SERIES_LABEL: Record<string, string> = {
  [FRED_SERIES.cpi]: "CPI (all urban consumers)",
  [FRED_SERIES.unemployment]: "Unemployment rate",
  [FRED_SERIES.gdp]: "Real GDP",
  [FRED_SERIES.fedFundsRate]: "Fed funds rate",
};

export type MarketStoryNewsItem = {
  headline: string;
  summary: string | null;
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

export type MarketStoryInputParams = {
  day: string;
  /** The Top 20's own changePercent/significant — same Ticker fields computeBreadth/computeSectorAverages already read. */
  top20: { symbol: string; changePercent: number; significant: boolean }[];
  /** INDEX_CARDS' own tickers (NASDAQ/S&P/Dow/Tech/Volatility/Semiconductors). */
  indices: { label: string; symbol: string; changePercent: number }[];
  /** Whatever macro_indicators currently holds — absent entirely before the first ingestion cycle. */
  macro: MarketStoryMacroRow[];
  news: MarketStoryNewsItem[];
};

export type MarketStoryInput = {
  day: string;
  breadth: ReturnType<typeof computeBreadth>;
  sectorAverages: SectorAverage[];
  indices: { label: string; symbol: string; changePercent: number }[];
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
  const { day, top20, indices, macro, news } = params;

  return {
    day,
    breadth: computeBreadth(top20),
    sectorAverages: computeSectorAverages(top20),
    indices,
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
