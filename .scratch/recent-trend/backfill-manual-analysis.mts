// One-off historical replacement for Sep 21-25, 2026.
// All prose is newly composed from the same stored facts and deterministic
// engines used by the production story pipelines. No LLM/provider calls.
// Dry-run by default; pass --write only after inspecting the printed samples.
import assert from "node:assert/strict";
import { readAllRows } from "../../src/lib/db-read.ts";
import { buildDayTicker } from "../../src/lib/day-ticker.ts";
import { formatPercent, formatPrice } from "../../src/lib/format.ts";
import { buildMarketStoryInput } from "../../src/lib/market-story-input.ts";
import { INDEX_CARDS, INDEX_SYMBOLS, NAME_BY_SYMBOL, PEERS, TOP_20 } from "../../src/lib/symbols.ts";
import { buildStoryInput } from "../../src/lib/story-input.ts";
import { computePeriodPerformance } from "../../src/lib/period-performance.ts";
import { computeRecentTrend } from "../../src/lib/trend-detection.ts";
import { dayWindow, tradingDay } from "../../src/lib/market.ts";
import { db } from "../../src/lib/supabase.ts";

const DAYS = ["2026-09-21", "2026-09-22", "2026-09-23", "2026-09-24", "2026-09-25"];
const STOCK_SYMBOLS = TOP_20.map((stock) => stock.symbol);
const ALL_HISTORY_SYMBOLS = [...STOCK_SYMBOLS, ...INDEX_SYMBOLS];
const ALL_TICKERS = [...STOCK_SYMBOLS, ...INDEX_SYMBOLS];
const MARKET_NEWS_RELEVANCE: Record<string, RegExp[]> = {
  "2026-09-21": [/stocks had a great day/i, /intel surges/i, /wall st futures rise/i, /stoxx 600 rallies on tech/i, /oil prices slide/i, /AI stocks gain/i],
  "2026-09-22": [/nasdaq hits intraday record/i, /top chip stock analyst/i, /diesel export ban/i, /stablecoin bank deposit rule/i, /oil rises amid/i, /gold slips as fed/i],
  "2026-09-23": [/wall street falls as oil prices/i, /bond yields spike/i, /microsoft bear/i, /meta is having a chatgpt/i, /european stocks gain as oil slides/i, /oil falls \$1/i],
  "2026-09-24": [/wall st slips as middle east/i, /philadelphia fed/i, /new york fed/i, /bond market selloff/i, /rates rise rapidly/i, /oil extends gains/i],
  "2026-09-25": [/microsoft gives copilot/i, /10-year treasury yield/i, /oil prices slide/i, /energy price crisis/i, /paramount promised hollywood/i, /trump-xi summit/i],
};
const percent = (value: number | null) => value == null ? "unavailable" : formatPercent(value);
const signedMove = (value: number) => `${value > 0 ? "gained" : value < 0 ? "fell" : "was unchanged at"} ${Math.abs(value).toFixed(2)}%`;
const ageText = (age: number | null) => age == null ? "no confirmed reversal age is available" : `the latest confirmed reversal was ${age} trading days ago`;
const ordinal = (value: number) => `${value}${value % 100 >= 11 && value % 100 <= 13 ? "th" : value % 10 === 1 ? "st" : value % 10 === 2 ? "nd" : value % 10 === 3 ? "rd" : "th"}`;

function singleNewsSummary(row: { summary?: unknown } | null): string | null {
  const value = row?.summary;
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0]?.summary === "string") return value[0].summary;
  if (value && typeof value === "object" && "summary" in value && typeof value.summary === "string") return value.summary;
  return null;
}

function trendSentence(trend: ReturnType<typeof computeRecentTrend>, move: number): string {
  if (trend.direction == null || trend.windowChangePercent == null) return "The trailing 10-trading-day read is unavailable because stored history is short.";
  const relation = trend.direction === "no-clear-trend"
    ? "Today's move has no established direction to compare against."
    : move === 0
      ? `Today's price was unchanged against the ${trend.direction}.`
      : (move > 0) === (trend.direction === "uptrend")
        ? `Today's move continued the ${trend.direction}.`
        : `Today's move went against the ${trend.direction}.`;
  return `Recent Trend: ${trend.direction}; net window change ${formatPercent(trend.windowChangePercent)}; ${ageText(trend.reversalDaysAgo)}. ${relation}`;
}

function gapText(name: string, value: number | null): string {
  return value == null ? `${name} unavailable` : `${name} ${formatPercent(value)}`;
}

function synthesizeStock(params: {
  symbol: string;
  day: string;
  ticker: ReturnType<typeof buildDayTicker>;
  prices: Map<string, ReturnType<typeof buildDayTicker>>;
  histories: Map<string, { tradingDay: string; close: number; changePercent: number | null }[]>;
  news: { headline: string; source_url: string; published_at: string; news_summaries: unknown }[];
  filings: { form: string; item_codes: string }[];
}) {
  const { symbol, day, ticker, prices, histories, news, filings } = params;
  assert.ok(ticker, `${day}/${symbol}: no daily ticker`);
  const stock = TOP_20.find((entry) => entry.symbol === symbol)!;
  const history = histories.get(symbol)!.filter((row) => row.tradingDay <= day);
  const peerSymbols = PEERS[symbol] ?? [];
  const peerBreakdown = peerSymbols.flatMap((peer) => {
    const row = prices.get(peer);
    return row ? [{ symbol: peer, changePercent: row.changePercent }] : [];
  });
  const sector = prices.get("XLK");
  const market = prices.get("SPY");
  const dailyCloses = history.map(({ tradingDay, close, changePercent }) => ({ tradingDay, close, changePercent }));
  const input = buildStoryInput({
    symbol, sessionDay: day, price: ticker.price, changePercent: ticker.changePercent,
    relativeVolume: ticker.relativeVolume, peerSymbols, peerBreakdown,
    sectorChangePercent: sector?.changePercent ?? null,
    marketChangePercent: market?.changePercent ?? null,
    dailyCloses,
    periodPerformance: computePeriodPerformance(dailyCloses, day),
    fundamentals: null,
    news: news.map((row) => ({ headline: row.headline, summary: singleNewsSummary({ summary: row.news_summaries }),
      sourceUrl: row.source_url, publishedAt: row.published_at, relatedSymbols: [symbol] })),
    secFilings: filings.map((row) => ({ form: row.form, itemCodes: row.item_codes })),
  });
  const name = stock.name;
  const move = ticker.changePercent;
  const peerAvg = input.peers.peerAveragePercent;
  const peerRelative = input.peers.vsPeersPercent;
  const rangeText = input.volatility.rangeLabel == null ? "52-week range position unavailable" : `price is ${input.volatility.rangeLabel} in its stored 52-week range`;
  const unusualText = input.volatility.percentile == null
    ? `Historical move percentile unavailable; ${rangeText}. ${trendSentence(input.recentTrend, move)}`
    : `${ordinal(Math.round(input.volatility.percentile))} percentile of stored daily move magnitudes; ${rangeText}. ${trendSentence(input.recentTrend, move)}`;
  const selectedNews = news[0] ?? null;
  const explanationParts: string[] = [];
  if (news.length) explanationParts.push(`Stored same-day related headline: “${news[0].headline}”. The record supplies context but does not establish that it caused the price move.`);
  else explanationParts.push("No same-day symbol-related news record is available in the retained source data, so no news catalyst is asserted.");
  if (filings.length) explanationParts.push(`Stored same-day SEC filing metadata: ${filings.map((f) => `${f.form} (${f.item_codes})`).join(", ")}. Filing metadata alone does not establish a price cause.`);
  else explanationParts.push("No same-day SEC filing record is stored for this symbol.");
  const peerPhrase = peerAvg == null ? "Peer comparison unavailable" : `peer mean ${formatPercent(peerAvg)}; difference from peer mean ${percent(peerRelative)}`;
  const headlineText = `${name} closed at ${formatPrice(ticker.price)} after it ${signedMove(move)}. ${trendSentence(input.recentTrend, move)}`;
  const comparison = `${name} ${signedMove(move)}; ${peerPhrase}. ${gapText("Technology-sector", input.divergence.vsSectorPercent)} and ${gapText("market", input.divergence.vsMarketPercent)}.`;
  const classification = input.movementClassification === "unknown"
    ? "Movement classification unavailable because the market comparison is missing."
    : `${input.movementClassification}: the stored stock-to-market divergence is ${percent(input.divergence.vsMarketPercent)}; this is the pipeline's divergence classification, not proof of a specific catalyst.`;
  const fundamentals = "Historical fundamentals snapshots are not stored per session date, so this backfill does not carry forward today's fundamentals into a past-day analysis.";
  const relation = `${peerPhrase}. Difference from Technology sector ${percent(input.divergence.vsSectorPercent)}; difference from market ${percent(input.divergence.vsMarketPercent)}. These comparisons describe relative performance, not cause.`;
  const ytd = input.periodPerformance.ytdPercent == null ? "Year-to-date return unavailable from stored closes." : `Year-to-date through ${day}: ${formatPercent(input.periodPerformance.ytdPercent)}.`;
  const mtd = input.periodPerformance.mtdPercent == null ? "Month-to-date return unavailable from stored closes." : `Month-to-date through ${day}: ${formatPercent(input.periodPerformance.mtdPercent)}.`;
  return {
    symbol,
    story_date: day,
    generated_at: new Date().toISOString(),
    sections: {
      headline: { text: headlineText, news: selectedNews ? { headline: selectedNews.headline, sourceUrl: selectedNews.source_url, publishedAt: selectedNews.published_at } : null },
      comparison,
      classification,
      unusualness: unusualText,
      explanation: explanationParts.join(" "),
      fundamentals,
      peerSectorRelation: relation,
      ytdTakeaway: `${ytd} ${mtd}`,
    },
  };
}

function synthesizeMarket(day: string, prices: Map<string, ReturnType<typeof buildDayTicker>>, histories: Map<string, { tradingDay: string; close: number; changePercent: number | null }[]>, news: { headline: string; summary: string | null }[]) {
  const trackedStocks = STOCK_SYMBOLS.flatMap((symbol) => {
    const ticker = prices.get(symbol);
    return ticker ? [{ symbol, changePercent: ticker.changePercent, significant: ticker.significant }] : [];
  });
  const indices = INDEX_CARDS.flatMap((card) => {
    const ticker = prices.get(card.symbol);
    return ticker ? [{ label: card.label, symbol: card.symbol, changePercent: ticker.changePercent, price: ticker.price }] : [];
  });
  const input = buildMarketStoryInput({ day, trackedStocks, indices,
    indexDailyCloses: [...histories.entries()].filter(([symbol]) => INDEX_SYMBOLS.includes(symbol)).flatMap(([symbol, rows]) => rows.filter((row) => row.tradingDay <= day).map((row) => ({ symbol, ...row }))),
    macro: [], news: news.map((row) => ({ ...row, sourceUrl: "", publishedAt: "" })) });
  const indexLine = (symbol: string) => {
    const item = indices.find((value) => value.symbol === symbol);
    return item ? `${item.label} ${formatPercent(item.changePercent)}` : `${symbol} unavailable`;
  };
  const breadth = input.breadth;
  const sectors = [...input.sectorAverages].sort((a, b) => b.averageChangePercent - a.averageChangePercent);
  const topSector = sectors[0];
  const bottomSector = sectors.at(-1);
  const gainers = [...trackedStocks].filter((row) => row.changePercent > 0).sort((a, b) => b.changePercent - a.changePercent).slice(0, 3).map((row) => `${row.symbol} ${formatPercent(row.changePercent)}`).join(", ");
  const losers = [...trackedStocks].filter((row) => row.changePercent < 0).sort((a, b) => a.changePercent - b.changePercent).slice(0, 3).map((row) => `${row.symbol} ${formatPercent(row.changePercent)}`).join(", ");
  const vixy = input.indices.find((row) => row.symbol === "VIXY");
  const vixyText = vixy ? `${signedMove(vixy.changePercent)}; ${vixy.volatilityPercentile == null ? "historical magnitude percentile unavailable" : `${ordinal(Math.round(vixy.volatilityPercentile))} percentile`}. ${trendSentence(vixy.recentTrend, vixy.changePercent)}` : "VIXY data unavailable.";
  const relevantNews = news.filter((item) => MARKET_NEWS_RELEVANCE[day]?.some((pattern) => pattern.test(item.headline)));
  const eventText = relevantNews.length ? `Market-relevant stored headlines: ${relevantNews.slice(0, 3).map((item) => `“${item.headline}”`).join("; ")}. Headlines are context and do not establish that an event caused that day's price moves.` : `No retained market-level headline passed the relevance screen for ${day}; no event catalyst is asserted.`;
  const breadthText = `${breadth.advancers} advancer${breadth.advancers === 1 ? "" : "s"}, ${breadth.decliners} decliner${breadth.decliners === 1 ? "" : "s"} and ${breadth.unchanged} unchanged among ${breadth.total} Top-20 stocks with stored closes; ${breadth.significantCount} cleared the Significant Movement rule.`;
  const leadership = topSector ? `${topSector.sector} led the covered sectors at ${formatPercent(topSector.averageChangePercent)} (${topSector.count} stored Top-20 names${topSector.stocks[0] ? `; strongest ${topSector.stocks[0].symbol} ${formatPercent(topSector.stocks[0].changePercent)}` : ""}).` : "Sector comparison unavailable.";
  const lagging = bottomSector && bottomSector !== topSector ? ` ${bottomSector.sector} was lowest at ${formatPercent(bottomSector.averageChangePercent)}.` : "";
  return {
    story_date: day,
    generated_at: new Date().toISOString(),
    sections: {
      overallRead: `${indexLine("QQQ")}; ${indexLine("SPY")}; ${indexLine("DIA")}. ${breadthText}`,
    standoutMovers: `Largest stored Top-20 gainers: ${gainers || "unavailable"}. Largest decliners: ${losers || "unavailable"}.`,
      sectorLeadership: `${leadership}${lagging}`,
      breadth: breadthText,
      marketEvents: eventText,
      macroContext: `No date-specific macro-indicator snapshot is stored for ${day}; macro releases are not inferred from the current snapshot. ${input.fomc.isDecisionDayToday ? "The calendar marks this as an FOMC decision day." : "The calendar does not mark this as an FOMC decision day."}`,
      volatilityContext: `VIXY futures ETF ${vixyText}`,
      closingSynthesis: `On ${day}, ${breadth.advancers} of ${breadth.total} covered Top-20 stocks advanced while ${breadth.decliners} declined. ${topSector ? `${topSector.sector} had the strongest covered-sector average at ${formatPercent(topSector.averageChangePercent)}.` : "Sector leadership was unavailable."} VIXY's session move was ${vixy ? formatPercent(vixy.changePercent) : "unavailable"}.`,
    },
  };
}

const closeRows = await readAllRows<{ symbol: string; trading_day: string; close: number; change_percent: number | null }>("manual-story-backfill-history", (signal, start, end) => db.from("daily_closes")
  .select("symbol,trading_day,close,change_percent", { count: "exact" })
  .in("symbol", ALL_HISTORY_SYMBOLS).lte("trading_day", DAYS.at(-1)!)
  .order("symbol", { ascending: true }).order("trading_day", { ascending: true }).range(start, end).abortSignal(signal));
const histories = new Map<string, { tradingDay: string; close: number; changePercent: number | null }[]>(ALL_HISTORY_SYMBOLS.map((symbol) => [symbol, []]));
for (const row of closeRows) histories.get(row.symbol)!.push({ tradingDay: row.trading_day, close: Number(row.close), changePercent: row.change_percent == null ? null : Number(row.change_percent) });
const { data: averages, error: avgError } = await db.from("price_cache").select("symbol,avg_volume").in("symbol", STOCK_SYMBOLS);
if (avgError) throw avgError;
const avgBySymbol = new Map((averages ?? []).map((row) => [row.symbol, row.avg_volume == null ? null : Number(row.avg_volume)]));

const stockRows: ReturnType<typeof synthesizeStock>[] = [];
const marketRows: ReturnType<typeof synthesizeMarket>[] = [];
for (const day of DAYS) {
  const { from, to } = dayWindow(day);
  const [dailyRows, snapshots, marketNews, stockNews, filingRows] = await Promise.all([
    db.from("daily_closes").select("symbol,close,change,change_percent").in("symbol", ALL_TICKERS).eq("trading_day", day),
    readAllRows<{ symbol: string; volume: number | null; price: number; snapshot_at: string }>("manual-story-backfill-snapshots", (signal, start, end) => db.from("intraday_snapshots").select("symbol,volume,price,snapshot_at", { count: "exact" }).in("symbol", ALL_TICKERS).gte("snapshot_at", from).lt("snapshot_at", to).order("snapshot_at", { ascending: true }).order("symbol", { ascending: true }).range(start, end).abortSignal(signal)),
    db.from("news").select("headline,source_url,published_at,news_summaries(summary)").eq("related_symbols", "{}").gte("published_at", `${day}T00:00:00Z`).lt("published_at", `${day}T23:59:59Z`).order("published_at", { ascending: false }),
    db.from("news").select("symbol:related_symbols,headline,source_url,published_at,news_summaries(summary)").gte("published_at", from).lt("published_at", to).order("published_at", { ascending: false }),
    db.from("sec_filings").select("symbol,form,item_codes").eq("filing_date", day),
  ]);
  for (const result of [dailyRows, marketNews, stockNews, filingRows]) if (result.error) throw result.error;
  const closeBySymbol = new Map((dailyRows.data ?? []).map((row) => [row.symbol, { close: Number(row.close), change: Number(row.change), changePercent: Number(row.change_percent) }]));
  const snapshotBySymbol = new Map<string, { volume: number[]; prices: number[] }>(ALL_TICKERS.map((symbol) => [symbol, { volume: [], prices: [] }]));
  for (const row of snapshots) {
    if (tradingDay(new Date(row.snapshot_at)) !== day) continue;
    const bucket = snapshotBySymbol.get(row.symbol);
    if (bucket) { if (row.volume != null) bucket.volume.push(Number(row.volume)); bucket.prices.push(Number(row.price)); }
  }
  const prices = new Map<string, ReturnType<typeof buildDayTicker>>();
  for (const symbol of ALL_TICKERS) {
    const values = snapshotBySymbol.get(symbol)!;
    const ticker = buildDayTicker({ symbol, name: NAME_BY_SYMBOL.get(symbol) ?? symbol,
      dailyClose: closeBySymbol.get(symbol) ?? null, snapshotVolumes: values.volume,
      currentAvgVolume: avgBySymbol.get(symbol) ?? null, sparkPrices: values.prices });
    if (ticker) prices.set(symbol, ticker);
  }
  const { data: existingStocks, error: existingStockError } = await db.from("stories").select("symbol").eq("story_date", day);
  const { data: existingMarket, error: existingMarketError } = await db.from("market_stories").select("story_date").eq("story_date", day);
  if (existingStockError) throw existingStockError;
  if (existingMarketError) throw existingMarketError;
  assert.equal(STOCK_SYMBOLS.filter((symbol) => prices.has(symbol)).length, 20, `${day}: expected all Top-20 closes`);
  assert.ok(INDEX_SYMBOLS.every((symbol) => prices.has(symbol)), `${day}: missing index proxy close`);
  const stockNewsBySymbol = new Map<string, NonNullable<typeof stockNews.data>>(STOCK_SYMBOLS.map((symbol) => [symbol, []]));
  for (const row of stockNews.data ?? []) {
    if (tradingDay(new Date(row.published_at)) !== day) continue;
    const symbols = (row.symbol ?? []) as string[];
    for (const symbol of symbols) if (stockNewsBySymbol.has(symbol)) stockNewsBySymbol.get(symbol)!.push(row);
  }
  for (const symbol of STOCK_SYMBOLS) {
    const selectedNews = stockNewsBySymbol.get(symbol) ?? [];
    stockRows.push(synthesizeStock({ symbol, day, ticker: prices.get(symbol)!, prices,
      histories, news: selectedNews as never,
      filings: (filingRows.data ?? []).filter((row) => row.symbol === symbol) }));
  }
  const marketNewsRows = (marketNews.data ?? []).map((row) => ({ headline: row.headline, summary: singleNewsSummary({ summary: row.news_summaries }) }));
  marketRows.push(synthesizeMarket(day, prices as Map<string, ReturnType<typeof buildDayTicker>>, histories, marketNewsRows));
  const sampleStock = stockRows.at(-20)!;
  console.log(JSON.stringify({ day, stockRows: 20, existingStockRows: existingStocks?.length ?? 0,
    marketRows: 1, marketExisted: Boolean(existingMarket?.length), snapshotRows: snapshots.length,
    stockSample: { symbol: sampleStock.symbol, headline: sampleStock.sections.headline.text,
      unusualness: sampleStock.sections.unusualness, fields: Object.keys(sampleStock.sections) },
    marketSample: marketRows.at(-1)!.sections }));
}

assert.equal(stockRows.length, 100);
assert.equal(marketRows.length, 5);
if (process.argv.includes("--write")) {
  const { error: stockWriteError } = await db.from("stories").upsert(stockRows, { onConflict: "symbol,story_date" });
  if (stockWriteError) throw stockWriteError;
  const { error: marketWriteError } = await db.from("market_stories").upsert(marketRows, { onConflict: "story_date" });
  if (marketWriteError) throw marketWriteError;
  console.log(JSON.stringify({ writtenStocks: stockRows.length, writtenMarket: marketRows.length, mode: "write" }));
} else {
  console.log(JSON.stringify({ preparedStocks: stockRows.length, preparedMarket: marketRows.length, mode: "dry-run", hint: "review samples, then rerun with --write" }));
}
