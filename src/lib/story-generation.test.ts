import assert from "node:assert/strict";
import { test } from "node:test";

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://story-generation-test.invalid";
process.env.SUPABASE_SECRET_KEY = "test-key";
process.env.GROQ_API_KEY = "test-key";
const { generateStories, generateStorySections } = await import("./story-generation.ts");
const { generateMarketStorySections } = await import("./market-story-generation.ts");
const { buildStoryInput } = await import("./story-input.ts");
const { buildMarketStoryInput } = await import("./market-story-input.ts");
const { STOCK_SECTION_KEYS, MARKET_SECTION_KEYS } = await import("./story-sections.ts");
const { TOP_20_SYMBOLS } = await import("./symbols.ts");
const { GroqRateLimitError } = await import("./groq.ts");

const stockInput = buildStoryInput({
  symbol: "NVDA", sessionDay: "2026-09-25", price: 100, changePercent: 1,
  relativeVolume: null, peerSymbols: [], peerBreakdown: [],
  sectorChangePercent: null, marketChangePercent: null, dailyCloses: [],
  periodPerformance: { ytdPercent: null, mtdPercent: null },
  fundamentals: null, news: [], secFilings: [],
});
const marketInput = buildMarketStoryInput({
  day: "2026-09-25", trackedStocks: [], indices: [], indexDailyCloses: [], macro: [], news: [],
});

async function withModel<T>(candidate: object, run: () => Promise<T>, status = 200): Promise<T> {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (input) => {
    assert.equal(new URL(String(input)).hostname, "api.groq.com", "section generation must not read/write an attempt table");
    calls++;
    return new Response(JSON.stringify(status === 200
      ? { choices: [{ message: { content: JSON.stringify(candidate) }, finish_reason: "stop" }] }
      : { error: { message: "rate limited" } }), { status });
  };
  try { return await run(); } finally {
    globalThis.fetch = original;
    assert.equal(calls, 1, "one generation call, no correction or review call");
  }
}

test("complete stock and market drafts publish with warnings without extra model calls", async () => {
  const stock = { headline: { text: "Unverified figure 99.99%.", sourceHeadline: null },
    ...Object.fromEntries(STOCK_SECTION_KEYS.map((k) => [k, "Retained evidence is limited."])) };
  const sections = await withModel(stock, () => generateStorySections(stockInput));
  assert.ok(sections.checks?.shown.some((issue) => issue.includes("99.99%")));
  assert.equal(sections.headline.text, stock.headline.text);
  assert.equal(sections.headline.news, null);
  const market = Object.fromEntries(MARKET_SECTION_KEYS.map((k) => [k, "Unverified figure 99.99%."]));
  const marketSections = await withModel(market, () => generateMarketStorySections(marketInput));
  assert.ok(marketSections.checks?.shown.some((issue) => issue.includes("99.99%")));
});

test("missing sections remain pending without a feedback write or immediate retry", async () => {
  await withModel({}, () => assert.rejects(generateStorySections(stockInput), /Missing analytical sections/));
  await withModel({}, () => assert.rejects(generateMarketStorySections(marketInput), /missing section/));
});

test("429 defers to a later tick with one model call and no feedback storage", async () => {
  await withModel({}, () => assert.rejects(generateStorySections(stockInput), GroqRateLimitError), 429);
});

test("repeatedly failing stocks do not starve the remaining stocks across cron slots", async () => {
  const originalFetch = globalThis.fetch;
  const originalNow = Date.now;
  let modelCalls = 0;
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.hostname === "api.groq.com") {
      modelCalls++;
      return new Response(JSON.stringify({ choices: [{ message: { content: "{}" }, finish_reason: "stop" }] }));
    }
    assert.equal(url.hostname, "story-generation-test.invalid");
    assert.equal(init?.method ?? "GET", "GET", "a failed draft must not write feedback");
    const table = url.pathname.split("/").pop()!;
    assert.notEqual(table, "story_analysis_attempts");
    let rows: object[] = [];
    if (table === "intraday_snapshots") rows = [{ snapshot_at: "2026-09-25T20:00:00Z" }];
    if (table === "price_cache") rows = TOP_20_SYMBOLS.map((symbol) => ({
      symbol, price: 100, change: 1, change_percent: 1, volume: null, avg_volume: null, updated_at: "2026-09-25T20:15:00Z",
    }));
    return new Response(JSON.stringify(rows), { headers: {
      "content-type": "application/json", "content-range": `0-${rows.length - 1}/${rows.length}`,
    } });
  };
  try {
    const reached = new Set<string>();
    for (let slot = 0; slot < TOP_20_SYMBOLS.length; slot++) {
      Date.now = () => slot * 5 * 60_000;
      const result = await generateStories("2026-09-25");
      assert.equal(result.failed.length, 1);
      reached.add(result.failed[0].split(":")[0]);
    }
    assert.equal(modelCalls, TOP_20_SYMBOLS.length);
    assert.deepEqual(reached, new Set(TOP_20_SYMBOLS));
  } finally { globalThis.fetch = originalFetch; Date.now = originalNow; }
});

test("a transient sec_filings failure is retried through the read seam, and no story is drafted without it", async () => {
  const originalFetch = globalThis.fetch;
  const originalNow = Date.now;
  let modelCalls = 0;
  let secAttempts = 0;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.hostname === "api.groq.com") {
      modelCalls++;
      return new Response(JSON.stringify({ choices: [{ message: { content: "{}" }, finish_reason: "stop" }] }));
    }
    const table = url.pathname.split("/").pop()!;
    if (table === "sec_filings") {
      secAttempts++;
      return new Response(JSON.stringify({ message: "upstream timeout" }), { status: 503 });
    }
    let rows: object[] = [];
    if (table === "intraday_snapshots") rows = [{ snapshot_at: "2026-09-25T20:00:00Z" }];
    if (table === "price_cache") rows = TOP_20_SYMBOLS.map((symbol) => ({
      symbol, price: 100, change: 1, change_percent: 1, volume: null, avg_volume: null, updated_at: "2026-09-25T20:15:00Z",
    }));
    return new Response(JSON.stringify(rows), { headers: {
      "content-type": "application/json", "content-range": `0-${Math.max(rows.length - 1, 0)}/${rows.length}`,
    } });
  };
  try {
    Date.now = () => 0;
    const result = await generateStories("2026-09-25");
    assert.equal(result.failed.length, 1);
    assert.match(result.failed[0], /sec_filings/);
    assert.equal(secAttempts, 3, "the filings read gets the shared retry budget, not a single attempt");
    assert.equal(modelCalls, 0);
  } finally { globalThis.fetch = originalFetch; Date.now = originalNow; }
});

test("the done-stories read is attempted once per budget slot, not multiplied by the client's own retries", async () => {
  const originalFetch = globalThis.fetch;
  const originalNow = Date.now;
  let doneAttempts = 0;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.hostname === "api.groq.com") throw new Error("no model call expected");
    const table = url.pathname.split("/").pop()!;
    if (table === "stories") {
      doneAttempts++;
      return new Response(JSON.stringify({ message: "upstream timeout" }), { status: 503 });
    }
    let rows: object[] = [];
    if (table === "intraday_snapshots") rows = [{ snapshot_at: "2026-09-25T20:00:00Z" }];
    if (table === "price_cache") rows = TOP_20_SYMBOLS.map((symbol) => ({
      symbol, price: 100, change: 1, change_percent: 1, volume: null, avg_volume: null, updated_at: "2026-09-25T20:15:00Z",
    }));
    return new Response(JSON.stringify(rows), { headers: {
      "content-type": "application/json", "content-range": `0-${Math.max(rows.length - 1, 0)}/${rows.length}`,
    } });
  };
  try {
    Date.now = () => 0;
    await assert.rejects(generateStories("2026-09-25"), /story-done/);
    assert.equal(doneAttempts, 3);
  } finally { globalThis.fetch = originalFetch; Date.now = originalNow; }
});
