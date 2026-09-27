import assert from "node:assert/strict";
import { test } from "node:test";

// Both jobs import the database client, which throws at load without env vars.
process.env.NEXT_PUBLIC_SUPABASE_URL ??= "https://story-validators-test.invalid";
process.env.SUPABASE_SECRET_KEY ??= "test-key";
const { buildStoryPrompt, validateStockTrend } = await import("./story-generation.ts");
const { buildMarketStoryPrompt, validateMarketTrend } = await import("./market-story-generation.ts");
const { buildStoryInput } = await import("./story-input.ts");
const { buildMarketStoryInput } = await import("./market-story-input.ts");

// Enough closes for a confirmed trend with a known swing age.
const closes = [100, 101, 103, 102, 104, 106, 105, 107, 109, 108, 110, 112, 111, 109].map((close, i) => ({
  tradingDay: `2026-08-${String(i + 10).padStart(2, "0")}`, close, changePercent: 0.5,
}));
const story = buildStoryInput({
  symbol: "NVDA", sessionDay: "2026-08-23", price: 109, changePercent: -1.8, relativeVolume: null,
  peerSymbols: [], peerBreakdown: [], sectorChangePercent: -0.5, marketChangePercent: 0.3,
  dailyCloses: closes, periodPerformance: { ytdPercent: 9, mtdPercent: 1 }, fundamentals: null,
  news: [], secFilings: [],
});
const trend = story.recentTrend;
const signed = (n: number) => `${n > 0 ? "+" : ""}${n.toFixed(2)}%`;
const stock = {
  headline: { text: "NVIDIA fell." }, comparison: "c", classification: "c", explanation: "e",
  fundamentals: "f", peerSectorRelation: "p", ytdTakeaway: "y",
  unusualness: `An ${trend.direction}, net ${signed(trend.windowChangePercent!)}, latest swing ${trend.reversalDaysAgo} trading days ago.`,
};

test("the fixture has a stated trend to check against", () => {
  assert.match(String(trend.direction), /^(?:up|down)trend$/);
  assert.notEqual(trend.windowChangePercent, null);
  assert.notEqual(trend.reversalDaysAgo, null);
});

test("stock drafts: trend only in unusualness, stated in full there", () => {
  assert.doesNotThrow(() => validateStockTrend(stock, story));
  assert.throws(() => validateStockTrend({ ...stock, comparison: "continuing the uptrend" }, story), /comparison: Recent Trend outside unusualness/);
  assert.throws(() => validateStockTrend({ ...stock, unusualness: "A quiet day." }, story), /missing supplied trend direction/);
});

test("stock drafts: missing data is never reported as no release, and YTD has no market comparison", () => {
  assert.throws(() => validateStockTrend({ ...stock, fundamentals: "No earnings were released today." }, story), /does not establish/);
  assert.throws(() => validateStockTrend({ ...stock, ytdTakeaway: "YTD it outperformed the market." }, story), /market YTD comparison/);
});

test("the stock prompt reads sector and market moves from the input it is given", () => {
  const { input } = buildStoryPrompt(story) as { input: { sector: { change: string }; market: { change: string } } };
  assert.equal(input.sector.change, "−0.50%");
  assert.equal(input.market.change, "+0.30%");
});

const market = buildMarketStoryInput({
  day: "2026-08-24",
  trackedStocks: [{ symbol: "NVDA", changePercent: 2, significant: false }],
  indices: [{ label: "Volatility", symbol: "VIXY", changePercent: -2, price: 16 }],
  indexDailyCloses: closes.map((row) => ({ symbol: "VIXY", ...row })),
  macro: [],
  news: [],
});
const vixy = market.indices[0].recentTrend;
const marketDraft = {
  overallRead: "o", standoutMovers: "s", sectorLeadership: "s", breadth: "b", marketEvents: "m",
  macroContext: "m", closingSynthesis: "c",
  volatilityContext: `VIXY ${vixy.direction}, net ${signed(vixy.windowChangePercent!)}, swing ${vixy.reversalDaysAgo} days ago.`,
};

test("market drafts: coverage, trend placement and missing macro", () => {
  assert.doesNotThrow(() => validateMarketTrend(marketDraft, market));
  assert.throws(() => validateMarketTrend({ ...marketDraft, breadth: "Covering 80% of the exchange." }, market), /share of the expected tracked names/);
  assert.throws(() => validateMarketTrend({ ...marketDraft, overallRead: "An uptrend day." }, market), /overallRead: remove ALL/);
  assert.throws(() => validateMarketTrend({ ...marketDraft, volatilityContext: "Calm." }, market), /missing VIXY direction/);
  assert.throws(() => validateMarketTrend({ ...marketDraft, macroContext: "No economic data were released." }, market), /does NOT mean no macro data/);
});

test("the market prompt ends with its structured input", () => {
  const prompt = buildMarketStoryPrompt(market);
  assert.match(prompt.instructions, /^INSTRUCTIONS\n/);
  assert.equal((prompt.input as { "trading day": string })["trading day"], "2026-08-24");
});
