// Export exact historical inputs for review/authoring. Never fabricate prose.
// Explicit --write accepts an authored draft and verifies its full coverage.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { loadHistoricalStoryInputs } from "../src/lib/story-history.ts";
import { db } from "../src/lib/supabase.ts";
import { validatePublishedFigures } from "../src/lib/story-analysis-quality.ts";
import { buildStoryPrompt, validateStockTrend } from "../src/lib/story-generation.ts";
import type { StoryInput } from "../src/lib/story-input.ts";
import type { StorySections } from "../src/lib/story-generation.ts";
import type { MarketStorySections } from "../src/lib/market-story-generation.ts";
import { buildMarketStoryPrompt, validateMarketTrend } from "../src/lib/market-story-generation.ts";
import { TOP_20_SYMBOLS } from "../src/lib/symbols.ts";

type HistoricalInput = Awaited<ReturnType<typeof loadHistoricalStoryInputs>>;
type Draft = { stocks: { symbol: string; story_date: string; sections: StorySections }[]; market: { story_date: string; sections: MarketStorySections }[] };
const DAYS = ["2026-09-21", "2026-09-22", "2026-09-23", "2026-09-24", "2026-09-25"];
const STOCK_KEYS = ["comparison", "classification", "unusualness", "explanation", "fundamentals", "peerSectorRelation", "ytdTakeaway"];
const MARKET_KEYS = ["overallRead", "standoutMovers", "sectorLeadership", "breadth", "marketEvents", "macroContext", "volatilityContext", "closingSynthesis"];
const path = process.argv[2];
if (!path) throw new Error("Usage: backfill-story-analysis.mts output.json [--ai] OR draft.json --validate|--write");

if (!process.argv.includes("--write") && !process.argv.includes("--validate")) {
  const inputsFlag = process.argv.indexOf("--inputs");
  const inputs = inputsFlag >= 0 ? JSON.parse(readFileSync(process.argv[inputsFlag + 1], "utf8")) as HistoricalInput[] : [];
  if (!inputs.length) for (const day of DAYS) inputs.push(await loadHistoricalStoryInputs(day));
  for (const input of inputs) input.market.coverage ??= { availableStocks: input.coverage.availableStocks, expectedStocks: input.coverage.expectedStocks };
  if (process.argv.includes("--ai")) {
    const { generateStorySections } = await import("../src/lib/story-generation.ts");
    const { generateMarketStorySections } = await import("../src/lib/market-story-generation.ts");
    writeFileSync(`${path}.inputs.json`, JSON.stringify(inputs, null, 2));
    const draft: Draft = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : { stocks: [], market: [] };
    const failures = new Map<string, number>();
    const rejected: Record<string, unknown> = {};
    const tasks = inputs.flatMap((input: HistoricalInput) => [
      ...input.stocks.map((stock: StoryInput) => ({ id: `${input.day}/${stock.symbol}`, input, stock })),
      { id: `${input.day}/market`, input, stock: null },
    ]);
    while (true) {
      const pending = tasks.filter(({ input, stock }) => stock
        ? !draft.stocks.some((r) => r.story_date === input.day && r.symbol === stock.symbol)
        : !draft.market.some((r) => r.story_date === input.day));
      if (!pending.length) break;
      let attempted = false;
      for (const task of pending) {
        if ((failures.get(task.id) ?? 0) >= 4) continue;
        attempted = true;
        const started = Date.now();
        try {
          const { input, stock } = task;
          if (stock) {
            const sector = input.market.indices.find((i) => i.symbol === "XLK")?.changePercent ?? null;
            const broad = input.market.indices.find((i) => i.symbol === "SPY")?.changePercent ?? null;
            const sections = await generateStorySections(stock, sector, broad);
            draft.stocks.push({ symbol: stock.symbol, story_date: input.day, sections });
          } else draft.market.push({ story_date: input.day, sections: await generateMarketStorySections(input.market) });
          writeFileSync(path, JSON.stringify(draft, null, 2));
          console.log(JSON.stringify({ accepted: task.id, stocks: draft.stocks.length, market: draft.market.length }));
        } catch (error) {
          failures.set(task.id, (failures.get(task.id) ?? 0) + 1);
          rejected[task.id] = { reason: error instanceof Error ? error.message : String(error),
            candidate: error && typeof error === "object" && "candidate" in error ? error.candidate : null };
          writeFileSync(`${path}.rejected.json`, JSON.stringify(rejected, null, 2));
          console.log(JSON.stringify({ rejected: task.id, attempt: failures.get(task.id), reason: (error instanceof Error ? error.message : String(error)).slice(0, 900) }));
        }
        // Measured 8000TPM; checkpointed between calls and resumable after interruption.
        await new Promise((resolve) => setTimeout(resolve, Math.max(0, 65_000 - (Date.now() - started))));
      }
      if (!attempted) throw new Error(`Review failures remain: ${pending.map((t) => t.id).join(", ")}; no DB writes made`);
    }
  } else writeFileSync(path, JSON.stringify(inputs, null, 2));
  console.log(JSON.stringify(inputs.map(({ day, stocks, coverage }) => ({ day, stockInputs: stocks.length, coverage }))));
} else {
  const draft = JSON.parse(readFileSync(path, "utf8")) as Draft;
  const inputs = JSON.parse(readFileSync(`${path}.inputs.json`, "utf8")) as HistoricalInput[];
  if (draft.stocks?.length !== 100 || draft.market?.length !== 5) throw new Error("Expected exactly 100 stocks and 5 market stories");
  const stockIds = new Set<string>();
  for (const row of draft.stocks) {
    if (!DAYS.includes(row.story_date) || !TOP_20_SYMBOLS.includes(row.symbol)) throw new Error("Unexpected stock/day");
    const id = `${row.story_date}/${row.symbol}`;
    if (stockIds.has(id)) throw new Error(`Duplicate ${id}`);
    stockIds.add(id);
    const input = inputs.find((d) => d.day === row.story_date)?.stocks.find((s) => s.symbol === row.symbol);
    if (!input) throw new Error(`${id}: missing captured evidence`);
    const market = inputs.find((d) => d.day === row.story_date)!.market;
    const prompt = buildStoryPrompt(row.symbol, input, input.news,
      market.indices.find((i) => i.symbol === "XLK")?.changePercent ?? null,
      market.indices.find((i) => i.symbol === "SPY")?.changePercent ?? null);
    validatePublishedFigures(row.sections as unknown as Record<string, unknown>, prompt);
    validateStockTrend(row.sections as unknown as Record<string, unknown>, input);
    for (const key of STOCK_KEYS) if (typeof row.sections[key as keyof StorySections] !== "string" || !String(row.sections[key as keyof StorySections]).trim()) throw new Error(`${id}: missing ${key}`);
    if (!row.sections.headline?.text?.trim()) throw new Error(`${id}: missing headline`);
    for (const key of ["headline", ...STOCK_KEYS.filter((k) => k !== "unusualness")]) {
      const text = key === "headline" ? row.sections.headline.text : row.sections[key as keyof StorySections];
      if (/Recent Trend:|10.trading.day|confirmed reversal|net window change/i.test(String(text))) throw new Error(`${id}: trend outside unusualness`);
    }
  }
  const marketIds = new Set<string>();
  for (const row of draft.market) {
    if (!DAYS.includes(row.story_date) || marketIds.has(row.story_date)) throw new Error("Unexpected/duplicate market day");
    marketIds.add(row.story_date);
    const input = inputs.find((d) => d.day === row.story_date)?.market;
    if (!input) throw new Error("Missing captured market evidence");
    validatePublishedFigures(row.sections as unknown as Record<string, unknown>, buildMarketStoryPrompt(input));
    validateMarketTrend(row.sections, input);
    for (const key of MARKET_KEYS) if (typeof row.sections[key as keyof MarketStorySections] !== "string" || !String(row.sections[key as keyof MarketStorySections]).trim()) throw new Error(`${row.story_date}: missing ${key}`);
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
