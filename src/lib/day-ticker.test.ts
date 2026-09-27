import assert from "node:assert/strict";
import { test } from "node:test";

import { buildDayTicker, type DayCloseRow } from "./day-ticker.ts";

const close = (over: Partial<DayCloseRow> = {}): DayCloseRow => ({
  close: 180, change: 2, changePercent: 1.1, volume: null, avgVolume: null, ...over,
});

test("no daily_closes row for that symbol/day yields null, not a fabricated ticker", () => {
  const ticker = buildDayTicker({ symbol: "NVDA", name: "NVIDIA", dailyClose: null, snapshotVolumes: [1000, 2000], sparkPrices: [100, 101] });
  assert.equal(ticker, null);
});

test("relative volume uses the volume and average stored with that session's close", () => {
  const ticker = buildDayTicker({
    symbol: "NVDA", name: "NVIDIA",
    dailyClose: close({ volume: 30_000_000, avgVolume: 60_000_000 }),
    snapshotVolumes: [1], sparkPrices: [180],
  });
  assert.equal(ticker?.volume, 30_000_000);
  assert.equal(ticker?.relativeVolume, 0.5);
  assert.equal(ticker?.avgVolume, 60_000_000);
});

// Regression: a past day used to be divided by today's 10-day average, so its
// Significant badge could change after the fact as the average moved.
test("a close stored without its average has unknown relative volume, never today's", () => {
  const ticker = buildDayTicker({
    symbol: "NVDA", name: "NVIDIA", dailyClose: close(),
    snapshotVolumes: [10_000_000, 8_000_000, 12_000_000], sparkPrices: [178, 179, 180],
  });
  assert.equal(ticker?.volume, 30_000_000); // per-bar snapshots summed, not the last bar
  assert.equal(ticker?.relativeVolume, null);
});

test("no stored volume and no snapshots yields null volume, not zero", () => {
  const ticker = buildDayTicker({ symbol: "NVDA", name: "NVIDIA", dailyClose: close(), snapshotVolumes: [], sparkPrices: [] });
  assert.equal(ticker?.volume, null);
  assert.equal(ticker?.relativeVolume, null);
});

test("significance is reused from the shared rule, not reimplemented", () => {
  const byPrice = buildDayTicker({ symbol: "NVDA", name: "NVIDIA", dailyClose: close({ change: 10, changePercent: 6 }), snapshotVolumes: [], sparkPrices: [] });
  assert.equal(byPrice?.significant, true);
  const byVolume = buildDayTicker({ symbol: "NVDA", name: "NVIDIA", dailyClose: close({ volume: 90, avgVolume: 30 }), snapshotVolumes: [], sparkPrices: [] });
  assert.equal(byVolume?.significant, true);
});

test("price/change/change% pass through from the stored daily_closes row exactly", () => {
  const ticker = buildDayTicker({
    symbol: "AAPL", name: "Apple", dailyClose: close({ close: 233.45, change: -1.2, changePercent: -0.51 }),
    snapshotVolumes: [1_000_000], sparkPrices: [234, 233.45],
  });
  assert.equal(ticker?.price, 233.45);
  assert.equal(ticker?.change, -1.2);
  assert.equal(ticker?.changePercent, -0.51);
});
