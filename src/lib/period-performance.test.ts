import assert from "node:assert/strict";
import { test } from "node:test";

import { computePeriodPerformance, ytdSeries } from "./period-performance.ts";

test("YTD and MTD both compare the session price against the first stored day of the period", () => {
  const rows = [
    { tradingDay: "2026-01-02", close: 100 },
    { tradingDay: "2026-08-01", close: 110 },
    { tradingDay: "2026-08-21", close: 121 },
  ];
  const { ytdPercent, mtdPercent } = computePeriodPerformance(rows, "2026-08-21", 121);
  assert.equal(ytdPercent, 21);
  assert.equal(mtdPercent, 10);
});

test("unsorted input is sorted before the baseline is picked", () => {
  const rows = [
    { tradingDay: "2026-08-21", close: 121 },
    { tradingDay: "2026-01-02", close: 100 },
  ];
  assert.equal(computePeriodPerformance(rows, "2026-08-21", 121).ytdPercent, 21);
});

test("no stored history yields null for both, never zero", () => {
  const result = computePeriodPerformance([], "2026-08-21", 100);
  assert.equal(result.ytdPercent, null);
  assert.equal(result.mtdPercent, null);
});

// Regression: daily_closes only gets today's row once the official closing
// print is confirmed. Without it, the stock's YTD used yesterday's close while
// the Market Story's index YTD used today's price — one prompt, two sessions.
test("a session with no stored close row is measured through its own price", () => {
  const rows = [
    { tradingDay: "2026-01-02", close: 100 },
    { tradingDay: "2026-08-20", close: 110 },
  ];
  assert.equal(computePeriodPerformance(rows, "2026-08-21", 121).ytdPercent, 21);
});

test("a stored row for the session is superseded by the session price, and later rows never count", () => {
  const rows = [
    { tradingDay: "2026-01-02", close: 100 },
    { tradingDay: "2026-08-21", close: 999 },
    { tradingDay: "2026-08-24", close: 500 },
  ];
  assert.equal(computePeriodPerformance(rows, "2026-08-21", 121).ytdPercent, 21);
});

test("stale data can answer YTD while leaving MTD null", () => {
  const rows = [{ tradingDay: "2026-01-05", close: 100 }];
  const result = computePeriodPerformance(rows, "2026-03-02", 150);
  assert.equal(result.ytdPercent, 50);
  assert.equal(result.mtdPercent, null);
});

test("a stored row on the period's first day is its own baseline, so it reads flat", () => {
  const result = computePeriodPerformance([{ tradingDay: "2026-08-03", close: 100 }], "2026-08-03", 100);
  assert.equal(result.mtdPercent, 0);
});

test("a fall reads as a negative percent, not an absolute value", () => {
  const rows = [{ tradingDay: "2026-08-01", close: 100 }];
  assert.equal(computePeriodPerformance(rows, "2026-08-21", 90).mtdPercent, -10);
});

// The YTD chart beside the YTD sentence: same year, same session price.
test("the YTD series is this year's stored closes before the session, ending at the session price", () => {
  const rows = [
    { tradingDay: "2025-12-31", close: 90 },
    { tradingDay: "2026-08-20", close: 110 },
    { tradingDay: "2026-01-02", close: 100 },
    { tradingDay: "2026-08-21", close: 999 },
    { tradingDay: "2026-08-24", close: 500 },
  ];
  assert.deepEqual(ytdSeries(rows, "2026-08-21", 121), [
    { tradingDay: "2026-01-02", close: 100 },
    { tradingDay: "2026-08-20", close: 110 },
    { tradingDay: "2026-08-21", close: 121 },
  ]);
});
