import assert from "node:assert/strict";
import { test } from "node:test";

import { buildDayTicker } from "./day-ticker.ts";

test("no daily_closes row for that symbol/day yields null, not a fabricated ticker", () => {
  const ticker = buildDayTicker({
    symbol: "NVDA",
    name: "NVIDIA",
    dailyClose: null,
    snapshotVolumes: [1000, 2000],
    currentAvgVolume: 50_000_000,
    sparkPrices: [100, 101],
  });
  assert.equal(ticker, null);
});

test("volume is the sum of that day's per-bar snapshots, not the last bar", () => {
  const ticker = buildDayTicker({
    symbol: "NVDA",
    name: "NVIDIA",
    dailyClose: { close: 180, change: 2, changePercent: 1.1 },
    snapshotVolumes: [10_000_000, 8_000_000, 12_000_000],
    currentAvgVolume: 60_000_000,
    sparkPrices: [178, 179, 180],
  });
  assert.equal(ticker?.volume, 30_000_000);
});

test("relative volume divides by the CURRENT average, not a historical one", () => {
  const ticker = buildDayTicker({
    symbol: "NVDA",
    name: "NVIDIA",
    dailyClose: { close: 180, change: 2, changePercent: 1.1 },
    snapshotVolumes: [30_000_000],
    currentAvgVolume: 60_000_000,
    sparkPrices: [180],
  });
  assert.equal(ticker?.relativeVolume, 0.5);
});

test("no snapshot rows for the day yields null volume and null relative volume, not zero", () => {
  const ticker = buildDayTicker({
    symbol: "NVDA",
    name: "NVIDIA",
    dailyClose: { close: 180, change: 2, changePercent: 1.1 },
    snapshotVolumes: [],
    currentAvgVolume: 60_000_000,
    sparkPrices: [],
  });
  assert.equal(ticker?.volume, null);
  assert.equal(ticker?.relativeVolume, null);
});

test("significance is reused from the shared rule, not reimplemented", () => {
  const ticker = buildDayTicker({
    symbol: "NVDA",
    name: "NVIDIA",
    dailyClose: { close: 180, change: 10, changePercent: 6 },
    snapshotVolumes: [10_000_000],
    currentAvgVolume: 60_000_000,
    sparkPrices: [180],
  });
  assert.equal(ticker?.significant, true);
});

test("price/change/change% pass through from the stored daily_closes row exactly", () => {
  const ticker = buildDayTicker({
    symbol: "AAPL",
    name: "Apple",
    dailyClose: { close: 233.45, change: -1.2, changePercent: -0.51 },
    snapshotVolumes: [1_000_000],
    currentAvgVolume: 40_000_000,
    sparkPrices: [234, 233.45],
  });
  assert.equal(ticker?.price, 233.45);
  assert.equal(ticker?.change, -1.2);
  assert.equal(ticker?.changePercent, -0.51);
});
