import assert from "node:assert/strict";
import { test } from "node:test";

import { categoriseNews, matchesSector, matchesSymbol } from "./news-category.ts";

test("an article with no tickers is market news", () => {
  assert.equal(categoriseNews([]), "market");
});

test("any tagged ticker makes it stock news", () => {
  assert.equal(categoriseNews(["NVDA"]), "stock");
  assert.equal(categoriseNews(["AMD", "INTC"]), "stock");
});

test("matchesSymbol checks direct membership", () => {
  assert.equal(matchesSymbol(["NVDA", "AMD"], "NVDA"), true);
  assert.equal(matchesSymbol(["NVDA", "AMD"], "AAPL"), false);
});

test("matchesSector checks any tagged symbol's sector", () => {
  // NVDA and AMD are both Semiconductors.
  assert.equal(matchesSector(["NVDA"], "Semiconductors"), true);
  assert.equal(matchesSector(["AAPL"], "Semiconductors"), false);
  assert.equal(matchesSector(["AAPL", "NVDA"], "Semiconductors"), true);
});
