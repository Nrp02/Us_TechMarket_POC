import assert from "node:assert/strict";
import { test } from "node:test";

import { SECTOR_BY_SYMBOL, TOP_20_SYMBOLS } from "./symbols.ts";

test("every Top-20 symbol has exactly one sector", () => {
  for (const symbol of TOP_20_SYMBOLS) {
    assert.ok(
      SECTOR_BY_SYMBOL[symbol],
      `${symbol} is missing from SECTOR_BY_SYMBOL`,
    );
  }
});

test("no sector is assigned to a symbol outside the Top 20", () => {
  for (const symbol of Object.keys(SECTOR_BY_SYMBOL)) {
    assert.ok(TOP_20_SYMBOLS.includes(symbol), `${symbol} is not a Top-20 symbol`);
  }
});
