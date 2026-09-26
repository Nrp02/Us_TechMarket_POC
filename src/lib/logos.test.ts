import assert from "node:assert/strict";
import { test } from "node:test";

import { FINNHUB_LOGO, MARK_SYMBOLS, logoSrc } from "./logos.ts";
import { TRACKED_STOCK_SYMBOLS } from "./symbols.ts";

// The marks are hotlinked, so a symbol missing from MARKS fails silently at
// render time as an empty plate rather than as an error. These tests move that
// failure to the build, which is the only reason MARK_SYMBOLS is exported.
test("every tracked stock has a mark", () => {
  const missing = TRACKED_STOCK_SYMBOLS.filter((s) => logoSrc(s) === null);
  assert.deepEqual(missing, []);
});

test("MARKS covers exactly the 43 tracked stocks", () => {
  assert.equal(MARK_SYMBOLS.length, 43);
  const extra = MARK_SYMBOLS.filter((s) => !TRACKED_STOCK_SYMBOLS.includes(s));
  assert.deepEqual(extra, []);
});

test("an unknown symbol has no mark", () => {
  assert.equal(logoSrc("ZZZZ"), null);
});

// theme/dark is the dark-inked variant, the one that reads on the light plate;
// theme/light is the white knock-out and would be invisible. The naming reads
// backwards, so pin it here rather than trusting the next reader to know.
test("marks are requested in the dark-inked variant", () => {
  for (const symbol of TRACKED_STOCK_SYMBOLS) {
    assert.match(logoSrc(symbol)!, /\/theme\/dark\//);
  }
  assert.match(FINNHUB_LOGO, /\/theme\/dark\//);
});

test("marks keep direct CDN hotlinking and a visible missing-asset response", () => {
  for (const symbol of TRACKED_STOCK_SYMBOLS) {
    const url = new URL(logoSrc(symbol)!);
    assert.equal(url.hostname, "cdn.brandfetch.io");
    assert.match(url.pathname, /\/fallback\/404\//);
    assert.ok(url.searchParams.get("c"));
  }
});
