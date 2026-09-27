// One historical input path for both AI replay and editorial backfills.
// Only stored, session-bounded facts; no latest price/volume/macro cache.
import { readDailyCloses } from "./daily-closes.ts";
import { readAllRows } from "./db-read.ts";
import { readDayNews } from "./day-news.ts";
import { buildMarketStoryInput } from "./market-story-input.ts";
import { computePeriodPerformance } from "./period-performance.ts";
import { isSignificant, relativeVolume } from "./significance.ts";
import { loadBusinessContext } from "./story-business-context.ts";
import { loadStoryFundamentals } from "./story-fundamentals.ts";
import { buildStoryInput } from "./story-input.ts";
import { db } from "./supabase.ts";
import { INDEX_CARDS, INDEX_SYMBOLS, PEERS, TOP_20_SYMBOLS, TRACKED_STOCK_SYMBOLS } from "./symbols.ts";

export async function loadHistoricalStoryInputs(day: string) {
  const symbols = [...TRACKED_STOCK_SYMBOLS, ...INDEX_SYMBOLS];
  const [closes, news, filings, fundamentals, business] = await Promise.all([
    readDailyCloses(`historical-closes:${day}`, symbols, day),
    readDayNews("all", day),
    readAllRows<{ symbol: string; form: string; item_codes: string }>(
      `historical-filings:${day}`, (signal, start, end) => db.from("sec_filings")
        .select("symbol,form,item_codes", { count: "exact" }).eq("filing_date", day)
        .order("symbol").order("accession_number").range(start, end).abortSignal(signal)),
    Promise.all(TOP_20_SYMBOLS.map(async (symbol) => [symbol, await loadStoryFundamentals(symbol, day)] as const)),
    Promise.all(TOP_20_SYMBOLS.map(async (symbol) => [symbol, await loadBusinessContext(symbol, day)] as const)),
  ]);
  const prices = new Map(closes.filter((row) => row.tradingDay === day && row.changePercent != null)
    .map((row) => [row.symbol, { price: row.close, changePercent: row.changePercent!,
      // Only the average stored with that close; never today's (see day-ticker.ts).
      relativeVolume: relativeVolume(row.volume, row.avgVolume) }]));
  const histories = new Map(symbols.map((symbol) => [symbol, closes.filter((r) => r.symbol === symbol)
    .map(({ tradingDay, close, changePercent }) => ({ tradingDay, close, changePercent }))]));
  const fundamentalsBySymbol = new Map(fundamentals);
  const businessBySymbol = new Map(business);
  const stocks = TOP_20_SYMBOLS.map((symbol) => {
    const price = prices.get(symbol);
    if (!price) throw new Error(`${day}/${symbol}: no historical closing price`);
    const peerSymbols = PEERS[symbol] ?? [];
    const dailyCloses = histories.get(symbol)!;
    return buildStoryInput({ symbol, sessionDay: day, ...price,
      peerSymbols, peerBreakdown: peerSymbols.flatMap((symbol) => {
        const peer = prices.get(symbol);
        return peer ? [{ symbol, changePercent: peer.changePercent }] : [];
      }), sectorChangePercent: prices.get("XLK")?.changePercent ?? null,
      marketChangePercent: prices.get("SPY")?.changePercent ?? null, dailyCloses,
      periodPerformance: computePeriodPerformance(dailyCloses, day, price.price),
      fundamentals: fundamentalsBySymbol.get(symbol) ?? null,
      businessContext: businessBySymbol.get(symbol) ?? [],
      news: news.filter((row) => row.relatedSymbols.includes(symbol)),
      secFilings: filings.filter((r) => r.symbol === symbol).map((r) => ({ form: r.form, itemCodes: r.item_codes })),
    });
  });
  const trackedStocks = TRACKED_STOCK_SYMBOLS.flatMap((symbol) => {
    const price = prices.get(symbol);
    return price ? [{ symbol, changePercent: price.changePercent, significant: isSignificant(price.changePercent, price.relativeVolume), relativeVolume: price.relativeVolume }] : [];
  });
  const market = buildMarketStoryInput({ day, trackedStocks,
    indices: INDEX_CARDS.flatMap((card) => {
      const price = prices.get(card.symbol);
      return price ? [{ label: card.label, symbol: card.symbol, ...price }] : [];
    }), indexDailyCloses: INDEX_SYMBOLS.flatMap((symbol) => histories.get(symbol)!.map((row) => ({ symbol, ...row }))),
    macro: [], news: news.filter((row) => row.relatedSymbols.length === 0),
  });
  return { day, stocks, market, coverage: {
    availableStocks: trackedStocks.length, expectedStocks: TRACKED_STOCK_SYMBOLS.length,
    missingStocks: TRACKED_STOCK_SYMBOLS.filter((symbol) => !prices.has(symbol)),
    relativeVolume: "Only where the close was stored with its own 10-day average; current averages are never projected backward.",
    macro: "No as-of macro snapshot is stored; use dated news only, not the current macro cache.",
  } };
}
