// One historical input path for both AI replay and editorial backfills.
// Only stored, session-bounded facts; no latest price/volume/macro cache.
import { readDailyCloses } from "./daily-closes.ts";
import { readAllRows } from "./db-read.ts";
import { dayWindow, tradingDay } from "./market.ts";
import { buildMarketStoryInput } from "./market-story-input.ts";
import { computePeriodPerformance } from "./period-performance.ts";
import { isSignificant } from "./significance.ts";
import { loadBusinessContext } from "./story-business-context.ts";
import { loadStoryFundamentals } from "./story-fundamentals.ts";
import { buildStoryInput, type StoryNewsItem } from "./story-input.ts";
import { db } from "./supabase.ts";
import { INDEX_CARDS, INDEX_SYMBOLS, PEERS, TOP_20_SYMBOLS, TRACKED_STOCK_SYMBOLS } from "./symbols.ts";

export async function loadHistoricalStoryInputs(day: string) {
  const { from, to } = dayWindow(day);
  const symbols = [...TRACKED_STOCK_SYMBOLS, ...INDEX_SYMBOLS];
  const [closes, news, filings, fundamentals, business] = await Promise.all([
    readDailyCloses(`historical-closes:${day}`, symbols, day),
    readAllRows<{ headline: string; source_url: string; published_at: string; related_symbols: string[]; news_summaries: unknown; news_evidence: unknown }>(
      `historical-news:${day}`, (signal, start, end) => db.from("news")
        .select("headline,source_url,published_at,related_symbols,news_summaries(summary),news_evidence(source_text)", { count: "exact" })
        .gte("published_at", from).lt("published_at", to).order("published_at").order("id")
        .range(start, end).abortSignal(signal)),
    readAllRows<{ symbol: string; form: string; item_codes: string }>(
      `historical-filings:${day}`, (signal, start, end) => db.from("sec_filings")
        .select("symbol,form,item_codes", { count: "exact" }).eq("filing_date", day)
        .order("symbol").order("accession_number").range(start, end).abortSignal(signal)),
    Promise.all(TOP_20_SYMBOLS.map(async (symbol) => [symbol, await loadStoryFundamentals(symbol, day)] as const)),
    Promise.all(TOP_20_SYMBOLS.map(async (symbol) => [symbol, await loadBusinessContext(symbol, day)] as const)),
  ]);
  const prices = new Map(closes.filter((row) => row.tradingDay === day && row.changePercent != null)
    .map((row) => [row.symbol, { price: row.close, changePercent: row.changePercent! }]));
  const histories = new Map(symbols.map((symbol) => [symbol, closes.filter((r) => r.symbol === symbol)
    .map(({ tradingDay, close, changePercent }) => ({ tradingDay, close, changePercent }))]));
  const newsItems: (StoryNewsItem & { relatedSymbols: string[] })[] = news
    .filter((row) => tradingDay(new Date(row.published_at)) === day).map((row) => ({
      headline: row.headline, sourceUrl: row.source_url, publishedAt: row.published_at,
      relatedSymbols: row.related_symbols ?? [],
      sourceText: (row.news_evidence as { source_text?: string } | null)?.source_text ?? null,
      summary: (row.news_summaries as { summary?: string } | null)?.summary ?? null,
    }));
  const fundamentalsBySymbol = new Map(fundamentals);
  const businessBySymbol = new Map(business);
  const stocks = TOP_20_SYMBOLS.map((symbol) => {
    const price = prices.get(symbol);
    if (!price) throw new Error(`${day}/${symbol}: no historical closing price`);
    const peerSymbols = PEERS[symbol] ?? [];
    const dailyCloses = histories.get(symbol)!;
    return buildStoryInput({ symbol, sessionDay: day, ...price, relativeVolume: null,
      peerSymbols, peerBreakdown: peerSymbols.flatMap((symbol) => {
        const peer = prices.get(symbol);
        return peer ? [{ symbol, changePercent: peer.changePercent }] : [];
      }), sectorChangePercent: prices.get("XLK")?.changePercent ?? null,
      marketChangePercent: prices.get("SPY")?.changePercent ?? null, dailyCloses,
      periodPerformance: computePeriodPerformance(dailyCloses, day),
      fundamentals: fundamentalsBySymbol.get(symbol) ?? null,
      businessContext: businessBySymbol.get(symbol) ?? [],
      news: newsItems.filter((row) => row.relatedSymbols.includes(symbol)),
      secFilings: filings.filter((r) => r.symbol === symbol).map((r) => ({ form: r.form, itemCodes: r.item_codes })),
    });
  });
  const trackedStocks = TRACKED_STOCK_SYMBOLS.flatMap((symbol) => {
    const price = prices.get(symbol);
    return price ? [{ symbol, changePercent: price.changePercent, significant: isSignificant(price.changePercent, null) }] : [];
  });
  const market = buildMarketStoryInput({ day, trackedStocks,
    indices: INDEX_CARDS.flatMap((card) => {
      const price = prices.get(card.symbol);
      return price ? [{ label: card.label, symbol: card.symbol, ...price }] : [];
    }), indexDailyCloses: INDEX_SYMBOLS.flatMap((symbol) => histories.get(symbol)!.map((row) => ({ symbol, ...row }))),
    macro: [], news: newsItems.filter((row) => row.relatedSymbols.length === 0),
  });
  return { day, stocks, market, coverage: {
    availableStocks: trackedStocks.length, expectedStocks: TRACKED_STOCK_SYMBOLS.length,
    missingStocks: TRACKED_STOCK_SYMBOLS.filter((symbol) => !prices.has(symbol)),
    relativeVolume: "Unavailable: no historical average-volume snapshot; current averages are not projected backward.",
    macro: "No as-of macro snapshot is stored; use dated news only, not the current macro cache.",
  } };
}
