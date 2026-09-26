import assert from "node:assert/strict";
import { test } from "node:test";

import { buildMarketStoryInput } from "./market-story-input.ts";

const BASE_PARAMS = {
  day: "2026-09-16", // a real 2026 FOMC decision day
  top20: [
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
    top20: [
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
