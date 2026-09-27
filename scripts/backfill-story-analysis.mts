// Export exact historical inputs for review/authoring. Never fabricate prose.
// Explicit --write accepts an authored draft and verifies its full coverage.
import { readFileSync, writeFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { loadHistoricalStoryInputs } from "../src/lib/story-history.ts";
import { db } from "../src/lib/supabase.ts";
import { generateJson } from "../src/lib/groq.ts";
import { TOP_20_SYMBOLS } from "../src/lib/symbols.ts";

const DAYS = ["2026-09-21", "2026-09-22", "2026-09-23", "2026-09-24", "2026-09-25"];
const STOCK_KEYS = ["comparison", "classification", "unusualness", "explanation", "fundamentals", "peerSectorRelation", "ytdTakeaway"];
const MARKET_KEYS = ["overallRead", "standoutMovers", "sectorLeadership", "breadth", "marketEvents", "macroContext", "volatilityContext", "closingSynthesis"];
const path = process.argv[2];
if (!path) throw new Error("Usage: backfill-story-analysis.mts output.json [--ai] OR draft.json --validate|--write");

if (!process.argv.includes("--write") && !process.argv.includes("--validate")) {
  const inputs = [];
  for (const day of DAYS) inputs.push(await loadHistoricalStoryInputs(day));
  if (process.argv.includes("--ai")) {
    const { generateStorySections } = await import("../src/lib/story-generation.ts");
    const { buildMarketStoryPrompt } = await import("../src/lib/market-story-generation.ts");
    const stocks = [];
    const market = [];
    for (const input of inputs) {
      const sector = input.market.indices.find((i) => i.symbol === "XLK")?.changePercent ?? null;
      const broad = input.market.indices.find((i) => i.symbol === "SPY")?.changePercent ?? null;
      for (const stock of input.stocks) {
        const sections = await generateStorySections(stock, sector, broad);
        stocks.push({ symbol: stock.symbol, story_date: input.day, sections });
        // One call per stock; pace under the provider's TPM ceiling.
        await new Promise((resolve) => setTimeout(resolve, 60_000));
      }
      const { data: sections } = await generateJson(buildMarketStoryPrompt(input.market), {
        timeoutMs: 30_000, reasoningEffort: "low", maxCompletionTokens: 4500 });
      market.push({ story_date: input.day, sections });
    }
    writeFileSync(path, JSON.stringify({ stocks, market }, null, 2));
  } else {
    writeFileSync(path, JSON.stringify(inputs, null, 2));
  }
  console.log(JSON.stringify(inputs.map(({ day, stocks, coverage }) => ({ day, stockInputs: stocks.length, coverage }))));
} else {
  const draft = JSON.parse(readFileSync(path, "utf8"));
  if (draft.stocks?.length !== 100 || draft.market?.length !== 5) throw new Error("Expected exactly 100 stocks and 5 market stories");
  const stockIds = new Set<string>();
  for (const row of draft.stocks) {
    if (!DAYS.includes(row.story_date) || !TOP_20_SYMBOLS.includes(row.symbol)) throw new Error("Unexpected stock/day");
    const id = `${row.story_date}/${row.symbol}`;
    if (stockIds.has(id)) throw new Error(`Duplicate ${id}`);
    stockIds.add(id);
    for (const key of STOCK_KEYS) if (typeof row.sections[key] !== "string" || !row.sections[key].trim()) throw new Error(`${id}: missing ${key}`);
    if (!row.sections.headline?.text?.trim()) throw new Error(`${id}: missing headline`);
    for (const key of ["headline", ...STOCK_KEYS.filter((k) => k !== "unusualness")]) {
      const text = key === "headline" ? row.sections.headline.text : row.sections[key];
      if (/Recent Trend:|10.trading.day|confirmed reversal|net window change/i.test(text)) throw new Error(`${id}: trend outside unusualness`);
    }
  }
  const marketIds = new Set<string>();
  for (const row of draft.market) {
    if (!DAYS.includes(row.story_date) || marketIds.has(row.story_date)) throw new Error("Unexpected/duplicate market day");
    marketIds.add(row.story_date);
    for (const key of MARKET_KEYS) if (typeof row.sections[key] !== "string" || !row.sections[key].trim()) throw new Error(`${row.story_date}: missing ${key}`);
  }
  if (process.argv.includes("--validate")) {
    console.log(JSON.stringify({ validatedStocks: stockIds.size, validatedMarket: marketIds.size }));
    process.exit(0);
  }
  // Keep a fresh rollback export immediately before the authorized replacement.
  const [stocks, market] = await Promise.all([
    db.from("stories").select("*").in("story_date", DAYS),
    db.from("market_stories").select("*").in("story_date", DAYS),
  ]);
  if (stocks.error || market.error) throw new Error(stocks.error?.message ?? market.error?.message);
  writeFileSync(`${path}.before.json`, JSON.stringify({ stocks: stocks.data, market: market.data }, null, 2));
  const generated_at = new Date().toISOString();
  const stockWrite = await db.from("stories").upsert(draft.stocks.map((r: object) => ({ ...r, generated_at })), { onConflict: "symbol,story_date" });
  if (stockWrite.error) throw new Error(stockWrite.error.message);
  const marketWrite = await db.from("market_stories").upsert(draft.market.map((r: object) => ({ ...r, generated_at })), { onConflict: "story_date" });
  if (marketWrite.error) throw new Error(marketWrite.error.message);
  const [storedStocks, storedMarket] = await Promise.all([
    db.from("stories").select("symbol,story_date,sections,generated_at").in("story_date", DAYS).in("symbol", TOP_20_SYMBOLS),
    db.from("market_stories").select("story_date,sections,generated_at").in("story_date", DAYS),
  ]);
  if (storedStocks.error || storedMarket.error) throw new Error(storedStocks.error?.message ?? storedMarket.error?.message);
  for (const row of draft.stocks) {
    const stored = storedStocks.data?.find((r) => r.symbol === row.symbol && r.story_date === row.story_date);
    if (!stored || !isDeepStrictEqual(stored.sections, row.sections)) throw new Error(`Readback mismatch: ${row.story_date}/${row.symbol}`);
  }
  for (const row of draft.market) {
    const stored = storedMarket.data?.find((r) => r.story_date === row.story_date);
    if (!stored || !isDeepStrictEqual(stored.sections, row.sections)) throw new Error(`Readback mismatch: market ${row.story_date}`);
  }
  writeFileSync(`${path}.after.json`, JSON.stringify({ stocks: storedStocks.data, market: storedMarket.data }, null, 2));
  console.log(JSON.stringify({ writtenStocks: draft.stocks.length, writtenMarket: draft.market.length,
    verifiedStocks: storedStocks.data?.length, verifiedMarket: storedMarket.data?.length, generated_at }));
}
