import assert from "node:assert/strict";
import { test } from "node:test";

import { SECTOR_BY_SYMBOL, TRACKED_STOCK_SYMBOLS } from "./symbols.ts";

test("every tracked symbol has exactly one sector", () => {
  for (const symbol of TRACKED_STOCK_SYMBOLS) {
    assert.ok(
      SECTOR_BY_SYMBOL[symbol],
      `${symbol} is missing from SECTOR_BY_SYMBOL`,
    );
  }
});

test("no sector is assigned to a symbol outside the tracked universe", () => {
  for (const symbol of Object.keys(SECTOR_BY_SYMBOL)) {
    assert.ok(TRACKED_STOCK_SYMBOLS.includes(symbol), `${symbol} is not a tracked symbol`);
  }
});
