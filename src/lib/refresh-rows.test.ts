import assert from "node:assert/strict";
import { test } from "node:test";

import { deriveSymbolRows } from "./refresh-rows.ts";
import type { Bar } from "./yahoo.ts";

// 2026-09-25 is a Friday in EDT, so 20:00Z is the 16:00 bell.
const bar = (iso: string, price: number): Bar => ({ at: new Date(iso), price, volume: 1_000 });
const quote = { price: 225.5, change: 2.5, changePercent: 1.12 };
const fridayBars = [bar("2026-09-25T19:45:00Z", 225.2), bar("2026-09-25T20:00:00Z", 225.07)];

// Regression: a forced refresh on Saturday 2026-09-26 stamped every symbol's
// Friday close with Saturday's date, because trading_day came from the clock.
test("the daily close is dated by the closing bar's session, not by when the refresh ran", () => {
  const rows = deriveSymbolRows({
    symbol: "NVDA",
    quote,
    day: { volume: 5_000, bars: fridayBars },
    avgVolume: 10_000,
    now: new Date("2026-09-26T17:53:00Z"),
  });
  assert.equal(rows.dailyClose?.trading_day, "2026-09-25");
  assert.equal(rows.dailyClose?.close, 225.07);
  assert.equal(rows.price.price, 225.07);
  assert.equal(rows.price.updated_at, "2026-09-26T17:53:00.000Z");
});

test("no closing bar means no daily close, and the live quote is stored as-is", () => {
  const rows = deriveSymbolRows({
    symbol: "NVDA",
    quote,
    day: { volume: 5_000, bars: [bar("2026-09-25T17:02:00Z", 224)] },
    avgVolume: null,
    now: new Date("2026-09-25T17:03:00Z"),
  });
  assert.equal(rows.dailyClose, null);
  assert.equal(rows.price.price, 225.5);
  assert.equal(rows.price.avg_volume, null);
});

test("snapshots snap to the 15-minute grid", () => {
  const rows = deriveSymbolRows({
    symbol: "NVDA",
    quote,
    day: { volume: 5_000, bars: [bar("2026-09-25T17:02:41Z", 224)] },
    avgVolume: null,
    now: new Date("2026-09-25T17:03:00Z"),
  });
  assert.deepEqual(rows.snapshots, [
    { symbol: "NVDA", price: 224, volume: 1_000, snapshot_at: "2026-09-25T17:00:00.000Z" },
  ]);
});

// A past session's Rel. Volume needs the average as it stood that day; there
// is nowhere else to get it once the next refresh overwrites price_cache.
test("the daily close keeps that session's volume and 10-day average", () => {
  const rows = deriveSymbolRows({
    symbol: "NVDA",
    quote,
    day: { volume: 5_000, bars: fridayBars },
    avgVolume: 10_000,
    now: new Date("2026-09-25T20:15:00Z"),
  });
  assert.equal(rows.dailyClose?.volume, 5_000);
  assert.equal(rows.dailyClose?.avg_volume, 10_000);
});
