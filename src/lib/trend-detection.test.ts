import assert from "node:assert/strict";
import { test } from "node:test";

import { computeRecentTrend } from "./trend-detection.ts";

const DAYS = ["01", "02", "03", "04", "07", "08", "09", "10", "11", "14", "15", "16"];
const rows = (closes: number[]) => closes.map((close, i) => ({ tradingDay: `2026-09-${DAYS[i]}`, close }));

test("fewer than ten closes leave all analytical fields null", () => {
  for (const count of [0, 1, 9]) {
    assert.deepEqual(computeRecentTrend(rows(Array.from({ length: count }, (_, i) => 100 + i))), {
      direction: null, windowChangePercent: null, reversalDaysAgo: null, daysAvailable: count,
    });
  }
});

test("monotonic windows report direction and net change with no reversal", () => {
  assert.deepEqual(computeRecentTrend(rows([100, 101, 102, 103, 104, 105, 106, 107, 108, 109])), {
    direction: "uptrend", windowChangePercent: 9, reversalDaysAgo: null, daysAvailable: 10,
  });
  assert.deepEqual(computeRecentTrend(rows([100, 99, 98, 97, 96, 95, 94, 93, 92, 91])), {
    direction: "downtrend", windowChangePercent: -9, reversalDaysAgo: null, daysAvailable: 10,
  });
});

test("a V and an inverted V report the confirmed turning day", () => {
  const v = computeRecentTrend(rows([110, 108, 106, 104, 100, 102, 104, 106, 108, 110]));
  assert.equal(v.direction, "uptrend");
  assert.equal(v.windowChangePercent, 0);
  assert.equal(v.reversalDaysAgo, 5);
  const inverted = computeRecentTrend(rows([100, 102, 104, 106, 110, 108, 106, 104, 102, 100]));
  assert.equal(inverted.direction, "downtrend");
  assert.equal(inverted.windowChangePercent, 0);
  assert.equal(inverted.reversalDaysAgo, 5);
});

test("flat and sub-threshold windows have no clear trend", () => {
  for (const closes of [Array(10).fill(100), [100, 100.1, 100.2, 100.3, 100.4, 100.5, 100.6, 100.7, 100.8, 100.9]]) {
    const result = computeRecentTrend(rows(closes));
    assert.equal(result.direction, "no-clear-trend");
    assert.equal(result.reversalDaysAgo, null);
  }
  assert.equal(computeRecentTrend(rows([100, 100, 100, 100, 100, 100, 100, 100, 100, 101])).direction, "uptrend");
  assert.equal(computeRecentTrend(rows([100, 100, 100, 100, 100, 100, 100, 100, 100, 99])).direction, "downtrend");
});

test("input order does not affect the result or mutate caller history", () => {
  const sorted = rows([100, 101, 102, 103, 104, 105, 106, 107, 108, 109]);
  const reversed = [...sorted].reverse();
  const original = structuredClone(reversed);
  assert.deepEqual(computeRecentTrend(reversed), computeRecentTrend(sorted));
  assert.deepEqual(reversed, original);
});

test("tied peaks and troughs are not confirmed swings", () => {
  for (const closes of [
    [100, 102, 104, 106, 110, 110, 106, 104, 102, 100],
    [110, 108, 106, 104, 100, 100, 104, 106, 108, 110],
  ]) {
    assert.equal(computeRecentTrend(rows(closes)).reversalDaysAgo, null);
  }
});

test("only the trailing ten closes affect the read, while daysAvailable counts all rows", () => {
  const history = rows([1, 1000, 100, 101, 102, 103, 104, 105, 106, 107, 108, 109]);
  assert.deepEqual(computeRecentTrend(history), {
    ...computeRecentTrend(history.slice(2)), daysAvailable: 12,
  });
});

test("two trading days is the youngest confirmed reversal; calendar gaps do not add days", () => {
  const result = computeRecentTrend(rows([110, 109, 108, 107, 106, 105, 104, 100, 102, 104]));
  assert.equal(result.reversalDaysAgo, 2);
  for (const closes of [
    [110, 109, 108, 107, 106, 105, 104, 103, 100, 102],
    [110, 109, 108, 107, 106, 105, 104, 103, 102, 100],
    [100, 101, 102, 103, 104, 105, 106, 107, 110, 108],
  ]) {
    assert.equal(computeRecentTrend(rows(closes)).reversalDaysAgo, null);
  }
});

test("market structure compares each kind of extreme with its own preceding extreme", () => {
  // Confirmed peaks at 2/5, troughs at 3/6. Their prices move together.
  const rising = computeRecentTrend(rows([100, 100, 110, 90, 100, 120, 95, 105, 105, 106]));
  assert.equal(rising.direction, "uptrend");
  assert.equal(rising.reversalDaysAgo, 3);
  const falling = computeRecentTrend(rows([100, 100, 120, 95, 100, 110, 90, 100, 100, 99]));
  assert.equal(falling.direction, "downtrend");
  assert.equal(falling.reversalDaysAgo, 3);
});

test("Higher High + Lower Low and Lower High + Higher Low are conflicting structure", () => {
  for (const closes of [
    [100, 100, 110, 90, 100, 120, 80, 100, 100, 100],
    [100, 100, 120, 80, 100, 110, 90, 100, 100, 100],
  ]) {
    const result = computeRecentTrend(rows(closes));
    assert.equal(result.direction, "no-clear-trend");
    assert.equal(result.reversalDaysAgo, 3);
  }
});

test("equal same-kind extremes cannot establish a strict rising or falling structure", () => {
  const result = computeRecentTrend(rows([100, 100, 110, 90, 100, 110, 95, 100, 100, 100]));
  assert.equal(result.direction, "no-clear-trend");
  assert.equal(result.reversalDaysAgo, 3);
});

test("two or three swings without both pairs do not fabricate a structure", () => {
  for (const closes of [
    [100, 100, 110, 90, 100, 100, 100, 100, 100, 100],
    [100, 100, 110, 90, 100, 120, 110, 110, 110, 110],
  ]) {
    const result = computeRecentTrend(rows(closes));
    assert.equal(result.direction, "no-clear-trend");
    assert.equal(result.reversalDaysAgo, null);
  }
});

test("a one-swing read uses the latest leg rather than net window change or swing type alone", () => {
  const recovery = computeRecentTrend(rows([120, 115, 110, 105, 100, 102, 104, 106, 108, 110]));
  assert.equal(recovery.direction, "uptrend");
  assert.ok(recovery.windowChangePercent! < 0);
  const pullback = computeRecentTrend(rows([80, 85, 90, 95, 100, 98, 96, 94, 92, 90]));
  assert.equal(pullback.direction, "downtrend");
  assert.ok(pullback.windowChangePercent! > 0);
  // A later unconfirmed move can erase the leg without creating a new swing.
  const erased = computeRecentTrend(rows([120, 115, 110, 105, 100, 102, 104, 106, 108, 100]));
  assert.equal(erased.direction, "no-clear-trend");
  assert.equal(erased.reversalDaysAgo, 5);
});
