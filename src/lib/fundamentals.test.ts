import assert from "node:assert/strict";
import { test } from "node:test";

import { classifyEarningsSurprise, classifyGrowthTrend } from "./fundamentals.ts";

test("a surprise within 2 points of zero reads as inline", () => {
  assert.equal(classifyEarningsSurprise(0), "inline");
  assert.equal(classifyEarningsSurprise(1.99), "inline");
  assert.equal(classifyEarningsSurprise(-1.99), "inline");
});

test("a surprise 2 points or more positive reads as beat", () => {
  assert.equal(classifyEarningsSurprise(2), "beat");
  assert.equal(classifyEarningsSurprise(12.5), "beat");
});

test("a surprise 2 points or more negative reads as miss", () => {
  assert.equal(classifyEarningsSurprise(-2), "miss");
  assert.equal(classifyEarningsSurprise(-8), "miss");
});

test("no earnings row yet yields unknown, never a guessed classification", () => {
  assert.equal(classifyEarningsSurprise(null), "unknown");
});

test("quarterly growth outpacing the TTM figure by 2+ points reads as accelerating", () => {
  assert.equal(classifyGrowthTrend(15, 10), "accelerating");
});

test("quarterly growth trailing the TTM figure by 2+ points reads as decelerating", () => {
  assert.equal(classifyGrowthTrend(5, 10), "decelerating");
});

test("quarterly and TTM within 2 points of each other reads as stable", () => {
  assert.equal(classifyGrowthTrend(10, 9), "stable");
  assert.equal(classifyGrowthTrend(10, 11.99), "stable");
});

test("either growth figure missing yields unknown", () => {
  assert.equal(classifyGrowthTrend(null, 10), "unknown");
  assert.equal(classifyGrowthTrend(10, null), "unknown");
  assert.equal(classifyGrowthTrend(null, null), "unknown");
});

test("a negative-to-less-negative swing is still a real change in trend", () => {
  // Growth can be negative (shrinking revenue); the comparison is still a
  // plain subtraction, not a special case for negative bases.
  assert.equal(classifyGrowthTrend(-2, -10), "accelerating");
  assert.equal(classifyGrowthTrend(-10, -2), "decelerating");
});
