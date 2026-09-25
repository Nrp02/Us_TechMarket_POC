import assert from "node:assert/strict";
import { test } from "node:test";

import { computePeriodPerformance } from "./period-performance.ts";

test("YTD and MTD both compare the latest close against the first stored day of the period", () => {
  const rows = [
    { tradingDay: "2026-01-02", close: 100 },
    { tradingDay: "2026-08-01", close: 110 },
    { tradingDay: "2026-08-21", close: 121 },
  ];
  const { ytdPercent, mtdPercent } = computePeriodPerformance(rows, "2026-08-21");
  assert.equal(ytdPercent, 21);
  assert.equal(mtdPercent, 10);
});

test("unsorted input is sorted before the baseline is picked", () => {
  const rows = [
    { tradingDay: "2026-08-21", close: 121 },
    { tradingDay: "2026-01-02", close: 100 },
  ];
  assert.equal(computePeriodPerformance(rows, "2026-08-21").ytdPercent, 21);
});

test("no rows at all yields null for both, never zero", () => {
  const result = computePeriodPerformance([], "2026-08-21");
  assert.equal(result.ytdPercent, null);
  assert.equal(result.mtdPercent, null);
});

test("stale data can answer YTD while leaving MTD null", () => {
  // yearStart <= monthStart always, so a row on/after monthStart is
  // necessarily also on/after yearStart — meaning YTD can never be null while
  // MTD holds a value. The reverse can: the newest stored row predates this
  // month (no refresh since January), so MTD has no row to anchor on even
  // though YTD does.
  const rows = [{ tradingDay: "2026-01-05", close: 100 }];
  const result = computePeriodPerformance(rows, "2026-03-01");
  assert.equal(result.ytdPercent, 0);
  assert.equal(result.mtdPercent, null);
});

test("a single row on the period's start is its own baseline, so the period reads flat", () => {
  const rows = [{ tradingDay: "2026-08-21", close: 100 }];
  const result = computePeriodPerformance(rows, "2026-08-21");
  assert.equal(result.mtdPercent, 0);
});

test("a fall reads as a negative percent, not an absolute value", () => {
  const rows = [
    { tradingDay: "2026-08-01", close: 100 },
    { tradingDay: "2026-08-21", close: 90 },
  ];
  assert.equal(computePeriodPerformance(rows, "2026-08-21").mtdPercent, -10);
});
