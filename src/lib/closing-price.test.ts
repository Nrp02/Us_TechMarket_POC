import assert from "node:assert/strict";
import { test } from "node:test";

import { hasReliableClose, reconcileClose } from "./closing-price.ts";
import type { Bar } from "./yahoo.ts";

// price_cache feeds the header, the Home watchlist and the AI summary's
// "closing price", so a quote stored here wrong is stated as fact in three
// places at once — and the timeline, which reads the bars instead, then
// disagrees with all three. That mismatch is what sent one investigation the
// wrong way entirely: the timeline was right and the quote was wrong.

// 2026-08-21 is a Friday in EDT, so UTC is ET+4 and 20:00Z is the 16:00 bell.
const bar = (hhmm: string, price: number): Bar => ({
  at: new Date(`2026-08-21T${hhmm}:00Z`),
  price,
  volume: 1_000,
});

const quote = (price: number, change: number) => ({
  price,
  change,
  changePercent: (change / (price - change)) * 100,
});

test("a session still running is left exactly as quoted", () => {
  const live = quote(214.9, -10.26);
  const session = [bar("19:30", 215.31), bar("19:45", 214.75)];

  assert.deepEqual(reconcileClose(live, session), live);
});

test("no bars at all leaves the quote alone", () => {
  const live = quote(214.9, -10.26);
  assert.deepEqual(reconcileClose(live, []), live);
});

// The measurement this whole module exists for, with the figures price_cache
// actually held. On ET day 2026-08-21 the closing-window tick ran at 16:15 and
// stored $214.75 for NVDA against an official close of $214.72 — the gap is
// after-hours trading, and the 16:00 bar carries the auction print itself.
// Finnhub quoted a change of -2.10 that day, putting the previous close at
// $216.85, which is the baseline the corrected change has to keep.
test("the closing print replaces a quote that drifted after the bell", () => {
  const drifted = quote(214.75, -2.1);
  const settled = reconcileClose(drifted, [bar("19:45", 214.75), bar("20:00", 214.72)]);

  assert.equal(settled.price, 214.72);
  // Re-derived against the same previous close, so the three still agree.
  assert.ok(Math.abs(settled.change - -2.13) < 1e-9, `change was ${settled.change}`);
  assert.ok(
    Math.abs(settled.changePercent - (-2.13 / 216.85) * 100) < 1e-9,
    `percent was ${settled.changePercent}`,
  );
});

test("a quote that already matched the close survives unchanged in value", () => {
  // 19 of the 20 stocks measured were in this position: the reconciliation has
  // to be a no-op for them, not a source of new drift.
  const exact = quote(146.47, -4.05);
  const settled = reconcileClose(exact, [bar("20:00", 146.47)]);

  assert.equal(settled.price, 146.47);
  assert.ok(Math.abs(settled.change - exact.change) < 1e-9);
  assert.ok(Math.abs(settled.changePercent - exact.changePercent) < 1e-9);
});

test("the latest bar at or after the bell wins, whatever order they arrive in", () => {
  const drifted = quote(100.5, 0.5);
  const settled = reconcileClose(drifted, [bar("20:00", 100.2), bar("19:45", 100.4)]);

  assert.equal(settled.price, 100.2);
});

test("a malformed baseline is left alone rather than half-applied", () => {
  // price - change <= 0 means the quote itself is broken. Correcting the price
  // while the change still described a different one would swap a small error
  // for a contradiction between two figures shown side by side.
  const broken = { price: 10, change: 10, changePercent: 0 };
  assert.deepEqual(reconcileClose(broken, [bar("20:00", 9.5)]), broken);
});

// hasReliableClose backs daily_closes: unlike price_cache, that table has no
// next tick to self-correct on, so a caller writing to it needs to know
// whether reconcileClose actually substituted the closing print, not merely
// whether a bar at/after the bell exists.
test("a closing bar with a well-formed baseline is reliable", () => {
  const good = quote(214.75, -2.1);
  assert.equal(hasReliableClose(good, [bar("20:00", 214.72)]), true);
});

test("no closing bar is never reliable, regardless of the quote", () => {
  const good = quote(214.75, -2.1);
  assert.equal(hasReliableClose(good, [bar("19:45", 214.75)]), false);
  assert.equal(hasReliableClose(good, []), false);
});

test("a closing bar with a malformed baseline is not reliable, even though reconcileClose falls back silently", () => {
  const broken = { price: 10, change: 10, changePercent: 0 };
  const bars = [bar("20:00", 9.5)];
  // reconcileClose quietly returns the untouched (broken) quote here — see the
  // test above — which is exactly the case a caller must be able to tell apart
  // from a genuine substitution before treating the result as history.
  assert.deepEqual(reconcileClose(broken, bars), broken);
  assert.equal(hasReliableClose(broken, bars), false);
});
