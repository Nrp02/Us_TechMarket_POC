import assert from "node:assert/strict";
import { test } from "node:test";

import { buildStoryInput, type StoryInputParams } from "./story-input.ts";

const base: StoryInputParams = {
  symbol: "NVDA",
  sessionDay: "2026-08-21",
  price: 214.72,
  changePercent: 3.5,
  relativeVolume: 1.8,
  peerSymbols: ["AMD", "AVGO", "QCOM"],
  peerBreakdown: [
    { symbol: "AMD", changePercent: 1.2 },
    { symbol: "AVGO", changePercent: -0.5 },
    { symbol: "QCOM", changePercent: 2.1 },
  ],
  sectorChangePercent: 1.0,
  marketChangePercent: 0.4,
  dailyCloses: [
    { tradingDay: "2026-01-02", close: 130, changePercent: 0.5 },
    { tradingDay: "2026-04-15", close: 180, changePercent: -4.2 },
    { tradingDay: "2026-08-20", close: 207.5, changePercent: 1.1 },
    { tradingDay: "2026-08-21", close: 214.72, changePercent: 3.5 },
  ],
  periodPerformance: { ytdPercent: 65.2, mtdPercent: 3.5 },
  fundamentals: {
    epsGrowthQuarterlyYoY: 18,
    epsGrowthTtmYoY: 12,
    revenueGrowthQuarterlyYoY: 20,
    revenueGrowthTtmYoY: 15,
    latestEarningsPeriod: "2026-05-28",
    latestEarningsSurprisePercent: 4.5,
  },
  news: [
    {
      headline: "NVIDIA beats on revenue",
      summary: "NVIDIA reported quarterly revenue ahead of analyst estimates.",
      sourceUrl: "https://finnhub.io/x",
      publishedAt: "2026-08-21T13:00:00Z",
      relatedSymbols: ["NVDA"],
    },
  ],
  secFilings: [],
};

test("a realistic scenario assembles every field, computed rather than passed through", () => {
  const input = buildStoryInput(base);

  assert.equal(input.symbol, "NVDA");
  assert.equal(input.sessionDay, "2026-08-21");
  assert.deepEqual(input.price, { price: 214.72, changePercent: 3.5, relativeVolume: 1.8 });

  assert.equal(input.significance.significant, true); // 3.5% + 1.8x rvol crosses the combo branch
  assert.ok(input.significance.score >= 1);

  assert.equal(input.peers.symbols.length, 3);
  assert.equal(input.peers.peerAveragePercent, (1.2 - 0.5 + 2.1) / 3);
  assert.equal(input.peers.vsPeersPercent, 3.5 - (1.2 - 0.5 + 2.1) / 3);
  assert.deepEqual(input.peers.breakdown, [
    { symbol: "AMD", changePercent: 1.2 },
    { symbol: "AVGO", changePercent: -0.5 },
    { symbol: "QCOM", changePercent: 2.1 },
  ]);

  assert.equal(input.divergence.vsSectorPercent, 2.5);
  assert.equal(input.divergence.vsMarketPercent, 3.1);
  assert.equal(input.divergence.vsSectorDirection, "same");
  assert.equal(input.divergence.vsMarketDirection, "same");
  assert.equal(input.movementClassification, "company-specific"); // vsMarket 3.1 >= 2

  // History excludes today's own row: |0.5|, |-4.2|, |1.1| — today's |3.5|
  // beats 0.5 and 1.1 but not 4.2, so 2/3 -> 66.67th percentile.
  assert.ok(Math.abs((input.volatility.percentile ?? 0) - (2 / 3) * 100) < 1e-9);
  // Range over all 4 closes (min 130, max 214.72), price at the max.
  assert.equal(input.volatility.rangeLabel, "near-high");

  assert.deepEqual(input.periodPerformance, { ytdPercent: 65.2, mtdPercent: 3.5 });

  assert.ok(input.fundamentals);
  assert.equal(input.fundamentals?.earningsSurprise, "beat");
  assert.equal(input.fundamentals?.epsGrowthTrend, "accelerating"); // 18 - 12 = 6 >= 2
  assert.equal(input.fundamentals?.revenueGrowthTrend, "accelerating"); // 20 - 15 = 5 >= 2

  assert.equal(input.news.length, 1);
  assert.equal(input.news[0].headline, "NVIDIA beats on revenue");

  assert.deepEqual(input.secFilings, []);
});

test("a same-day 8-K filing passes through unchanged", () => {
  const input = buildStoryInput({
    ...base,
    secFilings: [{ form: "8-K", itemCodes: "2.02,9.01" }],
  });
  assert.deepEqual(input.secFilings, [{ form: "8-K", itemCodes: "2.02,9.01" }]);
});

test("missing peer data flows through as null, not a fabricated average", () => {
  const input = buildStoryInput({ ...base, peerBreakdown: [] });
  assert.equal(input.peers.peerAveragePercent, null);
  assert.equal(input.peers.vsPeersPercent, null);
});

test("empty daily-close history leaves volatility fully null", () => {
  const input = buildStoryInput({ ...base, dailyCloses: [] });
  assert.equal(input.volatility.percentile, null);
  assert.equal(input.volatility.rangePosition, null);
  assert.equal(input.volatility.rangeLabel, null);
  assert.deepEqual(input.recentTrend, {
    direction: null, windowChangePercent: null, reversalDaysAgo: null, daysAvailable: 0,
  });
});

test("Recent Trend includes today's close and leaves insufficient history unavailable", () => {
  const days = ["10", "11", "12", "13", "14", "17", "18", "19", "20", "21"];
  const dailyCloses = days.map((day, i) => ({
    tradingDay: `2026-08-${day}`, close: 100 + i, changePercent: 1,
  }));
  const input = buildStoryInput({ ...base, dailyCloses });
  assert.deepEqual(input.recentTrend, {
    direction: "uptrend", windowChangePercent: 9, reversalDaysAgo: null, daysAvailable: 10,
  });
  const short = buildStoryInput({ ...base, dailyCloses: dailyCloses.slice(1) });
  assert.equal(short.recentTrend.direction, null);
  assert.equal(short.recentTrend.daysAvailable, 9);
  assert.equal(short.volatility.percentile, 100);
  assert.equal(short.volatility.rangeLabel, "near-high");
});

test("a symbol with no fundamentals row yet yields a null fundamentals section, not a guessed one", () => {
  const input = buildStoryInput({ ...base, fundamentals: null });
  assert.equal(input.fundamentals, null);
});

test("sector/market not yet fetched this session (both null) leaves divergence and classification null/unknown", () => {
  const input = buildStoryInput({ ...base, sectorChangePercent: null, marketChangePercent: null });
  assert.equal(input.divergence.vsSectorPercent, null);
  assert.equal(input.divergence.vsMarketPercent, null);
  assert.equal(input.movementClassification, "unknown");
});

test("a flat (zero) baseline day still assembles a valid, non-crashing payload", () => {
  const input = buildStoryInput({
    ...base,
    changePercent: 0,
    peerBreakdown: [
      { symbol: "AMD", changePercent: 0 },
      { symbol: "AVGO", changePercent: 0 },
    ],
    sectorChangePercent: 0,
    marketChangePercent: -2,
  });
  assert.equal(input.significance.significant, false);
  assert.equal(input.divergence.vsSectorDirection, "flat");
  assert.equal(input.movementClassification, "company-specific"); // |0 - (-2)| = 2
});

test("no results are ever free text — every field is a number or a value from a fixed label set", () => {
  const input = buildStoryInput(base);
  const labelFields = [
    input.movementClassification,
    input.volatility.rangeLabel,
    input.fundamentals?.earningsSurprise,
    input.fundamentals?.epsGrowthTrend,
    input.fundamentals?.revenueGrowthTrend,
    input.divergence.vsSectorDirection,
    input.divergence.vsMarketDirection,
  ];
  for (const value of labelFields) {
    if (value === undefined || value === null) continue;
    assert.equal(typeof value, "string");
    assert.ok(value.length < 30, `"${value}" reads like free text, not a fixed label`);
  }
});

test("10-year yield passes through, and is null rather than invented when absent", () => {
  assert.equal(buildStoryInput(base).tenYearYield, null);
  const y = { latestDate: "2026-09-24", latestValue: 5.18, priorDate: "2026-09-23", priorValue: 5.11 };
  assert.deepEqual(buildStoryInput({ ...base, tenYearYield: y }).tenYearYield, y);
});
