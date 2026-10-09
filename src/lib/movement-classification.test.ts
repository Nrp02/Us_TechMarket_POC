import assert from "node:assert/strict";
import { test } from "node:test";

import { classifyMovement } from "./movement-classification.ts";

test("a move within 2 points of the market reads as market-wide", () => {
  assert.equal(classifyMovement(0, null, null), "market-wide");
  assert.equal(classifyMovement(1.99, 5, 5), "market-wide");
  assert.equal(classifyMovement(-1.99, null, null), "market-wide");
});

test("a move 2 points or more from the market, sector and peers reads as company-specific", () => {
  assert.equal(classifyMovement(2, 2, 2), "company-specific");
  assert.equal(classifyMovement(-2, -3, -2.5), "company-specific");
  assert.equal(classifyMovement(6.4, null, null), "company-specific");
});

test("a move away from the market but within 2 points of the sector or peers reads as sector-wide", () => {
  // 2026-10-08: NVDA -2.94% vs SPY -0.42%, XLK -1.79% — the chip group fell together.
  assert.equal(classifyMovement(-2.52, -1.15, null), "sector-wide");
  assert.equal(classifyMovement(-3.48, -2.11, -0.5), "sector-wide");
  assert.equal(classifyMovement(3, 1.99, 2.5), "sector-wide");
});

test("no market figure yet this session yields unknown, never a guess", () => {
  assert.equal(classifyMovement(null, 0, 0), "unknown");
});
