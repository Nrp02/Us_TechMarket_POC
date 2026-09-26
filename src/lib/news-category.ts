// Which News tab an article belongs to, plus the Stock News symbol/sector
// filters.
//
// The Company/Industry split (watchlist overlap vs. not) is gone along with
// the watchlist itself — Stock News now shows all Top-20-tagged articles
// unfiltered by default, optionally narrowed by one symbol or one sector.

import { SECTOR_BY_SYMBOL } from "./symbols.ts";

export type NewsCategory = "stock" | "market";

/**
 * `market` is the general feed, which carries no tickers at all — measured
 * across the whole stored table, 19 of 19 general-feed rows had none and 116 of
 * 116 per-symbol rows had at least one, so an empty tag list identifies it
 * exactly. Everything else is Stock News.
 */
export function categoriseNews(relatedSymbols: string[]): NewsCategory {
  return relatedSymbols.length ? "stock" : "market";
}

/** True when `relatedSymbols` includes the given symbol. */
export function matchesSymbol(relatedSymbols: string[], symbol: string): boolean {
  return relatedSymbols.includes(symbol);
}

/** True when any of `relatedSymbols` belongs to the given sector. */
export function matchesSector(relatedSymbols: string[], sector: string): boolean {
  return relatedSymbols.some((symbol) => SECTOR_BY_SYMBOL[symbol] === sector);
}
