import assert from "node:assert/strict";
import { test } from "node:test";

import { classifyMovement } from "./movement-classification.ts";

test("a move within 2 points of the market reads as market-wide", () => {
  assert.equal(classifyMovement(0), "market-wide");
  assert.equal(classifyMovement(1.99), "market-wide");
  assert.equal(classifyMovement(-1.99), "market-wide");
});

test("a move 2 points or more from the market reads as company-specific", () => {
  assert.equal(classifyMovement(2), "company-specific");
  assert.equal(classifyMovement(-2), "company-specific");
  assert.equal(classifyMovement(6.4), "company-specific");
});

test("no market figure yet this session yields unknown, never a guess", () => {
  assert.equal(classifyMovement(null), "unknown");
});
