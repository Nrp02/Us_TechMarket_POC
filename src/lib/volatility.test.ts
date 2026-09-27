import assert from "node:assert/strict";
import { test } from "node:test";

import { computeRangePosition, computeVolatilityPercentile } from "./volatility.ts";

test("percentile is the share of historical |moves| today's move meets or beats", () => {
  // Today's |2%| beats 1 and -1.5 (both < 2 in magnitude) out of 4 historical
  // moves, so 2/4 = 50th percentile.
  const percentile = computeVolatilityPercentile(2, [1, -1.5, 3, -4]);
  assert.equal(percentile, 50);
});

test("a move bigger than the whole history sits at the 100th percentile", () => {
  assert.equal(computeVolatilityPercentile(10, [1, -2, 3]), 100);
});

test("a move smaller than the whole history sits at the 0th percentile", () => {
  assert.equal(computeVolatilityPercentile(0.1, [1, -2, 3]), 0);
});

test("only magnitude counts, not direction", () => {
  assert.equal(computeVolatilityPercentile(-5, [1, -2, 3]), computeVolatilityPercentile(5, [1, -2, 3]));
});

test("no history yields null, never a fabricated percentile", () => {
  assert.equal(computeVolatilityPercentile(2, []), null);
});

test("range position is (price - min) / (max - min), labeled by thirds", () => {
  assert.deepEqual(computeRangePosition(95, [60, 100]), { position: (95 - 60) / (100 - 60), label: "near-high", min: 60, max: 100 });
  assert.deepEqual(computeRangePosition(62, [60, 100]), { position: (62 - 60) / (100 - 60), label: "near-low", min: 60, max: 100 });
  assert.deepEqual(computeRangePosition(80, [60, 100]), { position: 0.5, label: "mid-range", min: 60, max: 100 });
});

test("a zero-width range (one stored close, or a flat year) yields null, not a divide-by-zero", () => {
  assert.deepEqual(computeRangePosition(60, [60]), { position: null, label: null, min: null, max: null });
  assert.deepEqual(computeRangePosition(60, [60, 60, 60]), { position: null, label: null, min: null, max: null });
});

test("no history yields null", () => {
  assert.deepEqual(computeRangePosition(60, []), { position: null, label: null, min: null, max: null });
});

// Regression: the prompt could state "104%" of the range while the chart beside
// it clamped the same price to 100%. Today's price is part of its own window.
test("a price beyond every stored close extends the range instead of leaving it", () => {
  assert.deepEqual(computeRangePosition(110, [60, 100]), { position: 1, label: "near-high", min: 60, max: 110 });
  assert.deepEqual(computeRangePosition(50, [60, 100]), { position: 0, label: "near-low", min: 50, max: 100 });
});
