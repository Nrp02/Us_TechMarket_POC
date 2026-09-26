// Manual verification only: real cached prices/history, production prompt
// builders and Groq client, no ingestion and no database writes.
// node --experimental-strip-types --env-file=.env.local --import ./scripts/test-resolve.mts
//   .scratch/recent-trend/smoke-generation.mts stock|market
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { readAllRows, readRows } from "../../src/lib/db-read.ts";
import { formatEtTime, formatPercent, formatPrice, formatRelVolume } from "../../src/lib/format.ts";
import { generateJson } from "../../src/lib/groq.ts";
import { tradingDay } from "../../src/lib/market.ts";
import { buildMarketStoryInput } from "../../src/lib/market-story-input.ts";
import { MARKET_ANALYSIS_GUIDELINE } from "../../src/lib/market-story-guideline.ts";
import { computePeriodPerformance } from "../../src/lib/period-performance.ts";
import { isSignificant, relativeVolume } from "../../src/lib/significance.ts";
import { buildStoryInput } from "../../src/lib/story-input.ts";
import { ANALYSIS_GUIDELINE } from "../../src/lib/story-guideline.ts";
import { db } from "../../src/lib/supabase.ts";
import { INDEX_CARDS, INDEX_SYMBOLS, NAME_BY_SYMBOL, PEERS, TRACKED_STOCK_SYMBOLS } from "../../src/lib/symbols.ts";

// Load the actual private prompt builders without creating a new public seam
// or importing the generation jobs (which persist stories). No copied prompt.
function sourceFunction(path: string, name: string, bindings: Record<string, unknown>) {
  const source = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true);
  const declarations = source.statements.filter((statement) =>
    (name === "buildPrompt" && ts.isVariableStatement(statement)) ||
    (ts.isFunctionDeclaration(statement) && [name, "percentOrNull"].includes(statement.name?.text ?? "")),
  ).map((statement) => statement.getText(source)).join("\n");
  const compiled = ts.transpileModule(declarations, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Function(...Object.keys(bindings), `${compiled}\nreturn ${name};`)(...Object.values(bindings));
}

const mode = process.argv[2];
assert.ok(mode === "stock" || mode === "market", "Choose stock or market");
// Override only this verification process, never the production configuration.
const testKey = process.env["GROQ_API_TEST-KEY"];
assert.ok(testKey, "GROQ_API_TEST-KEY is required for this verification");
process.env.GROQ_API_KEY = testKey;
const { data: prices, error: priceError } = await db.from("price_cache")
  .select("symbol,price,change_percent,volume,avg_volume,updated_at");
if (priceError) throw new Error(priceError.message);
assert.ok(prices?.length, "No cached prices");
const bySymbol = new Map(prices.map((row) => [row.symbol, row]));
const nvda = bySymbol.get("NVDA");
assert.ok(nvda, "No cached NVDA price");
// Resolve the actual session exactly as the production Market Story does.
// Cache timestamps and the newest close can include weekend maintenance rows.
const sessionDay = sourceFunction("src/lib/market-story-generation.ts", "latestMarketSessionDay", { db, readRows, tradingDay });
const day = await sessionDay();

async function history(symbol: string) {
  const { data, error } = await db.from("daily_closes")
    .select("trading_day,close,change_percent").eq("symbol", symbol)
    .lte("trading_day", day).order("trading_day", { ascending: false }).limit(370);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({ symbol, tradingDay: row.trading_day,
    close: Number(row.close), changePercent: row.change_percent == null ? null : Number(row.change_percent) }));
}

let prompt: string;
let trend: unknown;
if (mode === "stock") {
  const dailyCloses = await history("NVDA");
  const peerSymbols = PEERS.NVDA;
  const sector = bySymbol.get("XLK");
  const market = bySymbol.get("SPY");
  const input = buildStoryInput({
    symbol: "NVDA", sessionDay: day, price: Number(nvda.price), changePercent: Number(nvda.change_percent),
    relativeVolume: relativeVolume(nvda.volume, nvda.avg_volume), peerSymbols,
    peerBreakdown: peerSymbols.flatMap((symbol) => {
      const price = bySymbol.get(symbol);
      return price ? [{ symbol, changePercent: Number(price.change_percent) }] : [];
    }),
    sectorChangePercent: sector ? Number(sector.change_percent) : null,
    marketChangePercent: market ? Number(market.change_percent) : null,
    dailyCloses, periodPerformance: computePeriodPerformance(dailyCloses, day),
    fundamentals: null, news: [], secFilings: [],
  });
  assert.notEqual(input.recentTrend.direction, null, "NVDA needs ten stored closes");
  const build = sourceFunction("src/lib/story-generation.ts", "buildPrompt", {
    NAME_BY_SYMBOL, formatEtTime, formatPercent, formatPrice, formatRelVolume, ANALYSIS_GUIDELINE,
  });
  prompt = build("NVDA", input, [], sector ? Number(sector.change_percent) : null,
    market ? Number(market.change_percent) : null);
  trend = input.recentTrend;
  const unavailable = build("NVDA", buildStoryInput({
    symbol: "NVDA", sessionDay: day, price: Number(nvda.price), changePercent: Number(nvda.change_percent),
    relativeVolume: null, peerSymbols: [], peerBreakdown: [], sectorChangePercent: null,
    marketChangePercent: null, dailyCloses: [], periodPerformance: { ytdPercent: null, mtdPercent: null },
    fundamentals: null, news: [], secFilings: [],
  }), [], null, null);
  assert.equal(JSON.parse(unavailable.slice(unavailable.lastIndexOf("\nInput:\n") + 8))["recent trend (trailing 10 trading days)"], "not available");
} else {
  // Exact read path now shared by production charts and Market Story, not
  // a per-symbol workaround that could hide a production truncation defect.
  const load = sourceFunction("src/lib/queries.ts", "getIndexDailyClosesUncached", { db, INDEX_SYMBOLS, readAllRows });
  const indexDailyCloses = await load(day);
  const input = buildMarketStoryInput({
    day,
    indices: INDEX_CARDS.flatMap((card) => {
      const price = bySymbol.get(card.symbol);
      return price ? [{ label: card.label, symbol: card.symbol, price: Number(price.price),
        changePercent: Number(price.change_percent) }] : [];
    }),
    indexDailyCloses,
    trackedStocks: TRACKED_STOCK_SYMBOLS.flatMap((symbol) => {
      const price = bySymbol.get(symbol);
      const changePercent = Number(price?.change_percent);
      return price ? [{ symbol, changePercent,
        significant: isSignificant(changePercent, relativeVolume(price.volume, price.avg_volume)) }] : [];
    }),
    macro: [], news: [],
  });
  assert.notEqual(input.indices.find((index) => index.symbol === "VIXY")?.recentTrend.direction, null);
  const build = sourceFunction("src/lib/market-story-generation.ts", "buildPrompt", { MARKET_ANALYSIS_GUIDELINE });
  prompt = build(input);
  trend = input.indices.map((index) => ({ symbol: index.symbol, ...index.recentTrend }));
  const unavailable = build(buildMarketStoryInput({ day, indices: [{ label: "Volatility", symbol: "VIXY", price: 100,
    changePercent: 0 }], indexDailyCloses: [], trackedStocks: [], macro: [], news: [] }));
  const unavailableInput = unavailable.slice(unavailable.lastIndexOf("\nInput:\n") + 8)
    .split("\n\nFinal JSON check")[0];
  assert.equal(JSON.parse(unavailableInput)["index and sub-sector proxies"][0]["recent trend (trailing 10 trading days)"], "not available");
}

console.log(JSON.stringify({ mode, day, trend, promptCharacters: prompt.length, source: "real cached numeric data; news/macro/fundamentals omitted for this smoke run" }));
const providerFetch = globalThis.fetch;
globalThis.fetch = async (...args: Parameters<typeof fetch>) => {
  const response = await providerFetch(...args);
  if (String(args[0]).startsWith("https://api.groq.com/") && response.status === 429) {
    const body = await response.clone().json();
    console.error(JSON.stringify({ rateLimit: {
      message: String(body.error?.message).replace(/org_[A-Za-z0-9]+/g, "[organization]"),
      limitTokens: response.headers.get("x-ratelimit-limit-tokens"),
      remainingTokens: response.headers.get("x-ratelimit-remaining-tokens"),
      resetTokens: response.headers.get("x-ratelimit-reset-tokens"),
    } }));
  }
  return response;
};
const result = await generateJson<Record<string, unknown>>(prompt, { timeoutMs: 30_000,
  reasoningEffort: "low", maxCompletionTokens: 4500 });
console.log(JSON.stringify(result, null, 2));
