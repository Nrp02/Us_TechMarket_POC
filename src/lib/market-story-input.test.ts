import assert from "node:assert/strict";
import { test } from "node:test";

import { readAllRows } from "./db-read.ts";
import { buildMarketStoryInput } from "./market-story-input.ts";

const BASE_PARAMS = {
  day: "2026-09-16", // a real 2026 FOMC decision day
  trackedStocks: [
    { symbol: "NVDA", changePercent: 2, significant: false },
    { symbol: "AMD", changePercent: -1, significant: false },
  ],
  indices: [{ label: "NASDAQ 100", symbol: "QQQ", changePercent: 0.5, price: 500 }],
  indexDailyCloses: [
    { symbol: "QQQ", tradingDay: "2026-09-15", close: 495, changePercent: 0.3 },
    { symbol: "QQQ", tradingDay: "2026-09-14", close: 490, changePercent: -0.2 },
    // Today's own row, if already stored, must be excluded from its own percentile rank.
    { symbol: "QQQ", tradingDay: "2026-09-16", close: 500, changePercent: 0.5 },
  ],
  macro: [
    {
      seriesId: "CPIAUCSL",
      latestDate: "2026-08-01",
      latestValue: 334.1,
      priorDate: "2026-07-01",
      priorValue: 332.8,
    },
  ],
  news: [
    { headline: "Fed holds rates", summary: null, sourceUrl: "https://x", publishedAt: "2026-09-16T18:00:00Z" },
  ],
};

test("extended stocks contribute to market figures but not Top-20 significance", () => {
  const input = buildMarketStoryInput({
    ...BASE_PARAMS,
    trackedStocks: [
      { symbol: "NVDA", changePercent: 6, significant: true },
      { symbol: "ASML", changePercent: 8, significant: true },
      { symbol: "F", changePercent: -7, significant: true },
    ],
  });
  assert.equal(input.breadth.total, 3);
  assert.equal(input.breadth.significantCount, 1);
  assert.equal(input.topMovers.gainers[0].symbol, "ASML");
  assert.equal(input.sectorAverages.find(s => s.sector === "Semiconductors")?.count, 2);
});

test("a realistic scenario assembles every field, computed rather than passed through", () => {
  const input = buildMarketStoryInput(BASE_PARAMS);
  assert.equal(input.breadth.advancers, 1);
  assert.equal(input.breadth.decliners, 1);
  assert.equal(input.sectorAverages.length > 0, true);
  assert.equal(input.indices[0].symbol, "QQQ");
  assert.equal(input.macro[0].seriesLabel, "CPI (all urban consumers)");
  assert.equal(input.fomc.isDecisionDayToday, true);
  assert.equal(input.news.length, 1);
});

test("topMovers ranks the Top 20 by changePercent, gainers and losers each largest-first", () => {
  const input = buildMarketStoryInput({
    ...BASE_PARAMS,
    trackedStocks: [
      { symbol: "NVDA", changePercent: 2, significant: false },
      { symbol: "AMD", changePercent: -1, significant: false },
      { symbol: "AAPL", changePercent: 5, significant: false },
      { symbol: "MSFT", changePercent: -4, significant: false },
      { symbol: "GOOGL", changePercent: 0.5, significant: false },
      { symbol: "META", changePercent: -0.2, significant: false },
    ],
  });
  // TOP_MOVERS_COUNT is 3: largest 3 gains, largest 3 losses.
  assert.deepEqual(
    input.topMovers.gainers.map((m) => m.symbol),
    ["AAPL", "NVDA", "GOOGL"],
  );
  assert.deepEqual(
    input.topMovers.losers.map((m) => m.symbol),
    ["MSFT", "AMD", "META"],
  );
});

test("an index's volatility percentile excludes its own today row, and range position uses today's price", () => {
  const input = buildMarketStoryInput(BASE_PARAMS);
  const qqq = input.indices.find((i) => i.symbol === "QQQ");
  // |0.5| is the largest of the three historical magnitudes (0.3, 0.2) once
  // today's own 0.5 row is excluded, so it beats both of them: 100th percentile.
  assert.equal(qqq?.volatilityPercentile, 100);
  // price 500 against a 490-500 range (including today's own close) is the high.
  assert.equal(qqq?.rangeLabel, "near-high");
});

test("an index with no stored history yields null volatility/range rather than a crash", () => {
  const input = buildMarketStoryInput({ ...BASE_PARAMS, indexDailyCloses: [] });
  const qqq = input.indices.find((i) => i.symbol === "QQQ");
  assert.equal(qqq?.volatilityPercentile, null);
  assert.equal(qqq?.rangePosition, null);
  assert.equal(qqq?.rangeLabel, null);
  assert.deepEqual(qqq?.recentTrend, {
    direction: null, windowChangePercent: null, reversalDaysAgo: null, daysAvailable: 0,
  });
});

test("Recent Trend keeps each proxy's history separate and includes today's close", () => {
  const days = ["02", "03", "04", "07", "08", "09", "10", "11", "14", "15"];
  const input = buildMarketStoryInput({
    ...BASE_PARAMS,
    day: "2026-09-15",
    indices: [
      { label: "NASDAQ 100", symbol: "QQQ", changePercent: 1, price: 109 },
      { label: "Volatility", symbol: "VIXY", changePercent: -1, price: 91 },
      { label: "Technology", symbol: "XLK", changePercent: 1, price: 109 },
    ],
    indexDailyCloses: days.flatMap((day, i) => [
      { symbol: "QQQ", tradingDay: `2026-09-${day}`, close: 100 + i, changePercent: i === 9 ? 20 : 1 },
      { symbol: "VIXY", tradingDay: `2026-09-${day}`, close: 100 - i, changePercent: -1 },
      ...(i === 0 ? [] : [{ symbol: "XLK", tradingDay: `2026-09-${day}`, close: 100 + i, changePercent: 1 }]),
    ]).reverse(),
  });
  assert.deepEqual(input.indices[0].recentTrend, {
    direction: "uptrend", windowChangePercent: 9, reversalDaysAgo: null, daysAvailable: 10,
  });
  assert.deepEqual(input.indices[1].recentTrend, {
    direction: "downtrend", windowChangePercent: -9, reversalDaysAgo: null, daysAvailable: 10,
  });
  assert.equal(input.indices[2].recentTrend.direction, null);
  assert.equal(input.indices[2].recentTrend.daysAvailable, 9);
  assert.equal(input.indices[0].volatilityPercentile, 100);
});

test("paginated ETF history supplies VIXY and XLK beyond the first 1000 rows", async () => {
  const symbols = ["DIA", "QQQ", "SOXX", "SPY", "VIXY", "XLK"];
  const history = symbols.flatMap((symbol) => Array.from({ length: 251 }, (_, i) => ({
    symbol, tradingDay: new Date(Date.UTC(2025, 0, 1 + i)).toISOString().slice(0, 10),
    close: 100 + i, changePercent: 1,
  })));
  const inputParams = { ...BASE_PARAMS,
    indices: symbols.map((symbol) => ({ label: symbol, symbol, price: 350, changePercent: 1 })),
  };
  const truncated = buildMarketStoryInput({ ...inputParams, indexDailyCloses: history.slice(0, 1000) });
  assert.equal(truncated.indices.find((index) => index.symbol === "VIXY")?.recentTrend.direction, null);
  const complete = await readAllRows("index-daily-closes", async (_signal, from, to) => ({
    data: history.slice(from, to + 1), count: history.length, error: null,
  }));
  const input = buildMarketStoryInput({ ...inputParams, indexDailyCloses: complete });
  for (const symbol of ["VIXY", "XLK"]) {
    const proxy = input.indices.find((index) => index.symbol === symbol);
    assert.equal(proxy?.recentTrend.direction, "uptrend");
    assert.equal(proxy?.recentTrend.daysAvailable, 251);
    assert.equal(proxy?.volatilityPercentile, 100);
    assert.equal(proxy?.rangeLabel, "near-high");
  }
});

test("an unrecognized macro series id passes through as its own label rather than crashing", () => {
  const input = buildMarketStoryInput({
    ...BASE_PARAMS,
    macro: [{ seriesId: "SOMETHING_NEW", latestDate: "2026-09-01", latestValue: 1, priorDate: null, priorValue: null }],
  });
  assert.equal(input.macro[0].seriesLabel, "SOMETHING_NEW");
});

test("no macro data yet (before the first ingestion cycle) yields an empty array, not a crash", () => {
  const input = buildMarketStoryInput({ ...BASE_PARAMS, macro: [] });
  assert.deepEqual(input.macro, []);
});

test("a non-FOMC day reports no decision today but still names the most recent one", () => {
  const input = buildMarketStoryInput({ ...BASE_PARAMS, day: "2026-09-20" });
  assert.equal(input.fomc.isDecisionDayToday, false);
  assert.equal(input.fomc.mostRecentDecisionDay, "2026-09-16");
});

test("no results are ever free text — every field is a number, a date, or a value from a fixed label set (news content excepted, same as story-input.ts)", () => {
  const input = buildMarketStoryInput(BASE_PARAMS);
  assert.equal(typeof input.breadth.advancers, "number");
  assert.equal(typeof input.fomc.isDecisionDayToday, "boolean");
  assert.equal(typeof input.macro[0].seriesLabel, "string");
});

test("index YTD/MTD run to today's price and ignore closes after the session", () => {
  const input = buildMarketStoryInput({
    ...BASE_PARAMS,
    indices: [{ label: "Technology", symbol: "XLK", changePercent: 1, price: 120 }],
    indexDailyCloses: [
      { symbol: "XLK", tradingDay: "2026-01-02", close: 100, changePercent: 0 },
      { symbol: "XLK", tradingDay: "2026-09-01", close: 110, changePercent: 0 },
      { symbol: "XLK", tradingDay: "2026-09-17", close: 999, changePercent: 0 },
    ],
  });
  const { ytdPercent, mtdPercent } = input.indices[0].periodPerformance;
  assert.ok(Math.abs(ytdPercent! - 20) < 1e-9);
  assert.ok(Math.abs(mtdPercent! - 100 / 11) < 1e-9);
});

test("rate series are marked as percent; index-level series are not", () => {
  const input = buildMarketStoryInput({ ...BASE_PARAMS, macro: [
    ...BASE_PARAMS.macro,
    { seriesId: "DGS10", latestDate: "2026-09-15", latestValue: 5.18, priorDate: "2026-09-14", priorValue: 5.11 },
  ] });
  assert.deepEqual(input.macro.map((m) => [m.isPercent, m.seriesLabel.startsWith("10-year")]), [[false, false], [true, true]]);
});
