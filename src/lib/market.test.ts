import assert from "node:assert/strict";
import { test } from "node:test";

import { dayWindow, tradingDay, sessionDayTimes } from "./market.ts";

// dayWindow used to exist twice — once in queries.ts and once inline in
// day-data.ts — with the same arithmetic copied out. Four read paths depend on
// it (sparklines, the intraday chart, a symbol's news, the News page's date
// filter), and each one narrows with the window and then re-checks the exact ET
// day afterwards. A window that failed to contain the whole day would silently
// drop rows from one end of it, so the property worth testing is containment,
// not the literal timestamps.

/**
 * Every instant in a 3-day span around `day`, hourly. Wide enough to cover both
 * ET boundaries of the day plus the window's own overhang.
 */
function hoursAround(day: string): Date[] {
  const start = Date.parse(`${day}T00:00:00Z`) - 86_400_000;
  return Array.from({ length: 24 * 4 }, (_, i) => new Date(start + i * 3_600_000));
}

/**
 * The invariant every caller relies on: an instant belongs to the ET day exactly
 * when the window contains it, or — where the window is wider — the caller's own
 * `tradingDay(...) === day` re-check settles it. What must never happen is an
 * instant on that ET day falling OUTSIDE the window, because no re-check can
 * recover a row the query never returned.
 */
function assertContainsWholeDay(day: string) {
  const { from, to } = dayWindow(day);

  for (const at of hoursAround(day)) {
    if (tradingDay(at) !== day) continue;
    const iso = at.toISOString();
    assert.ok(
      iso >= from && iso < to,
      `${iso} is on ET day ${day} but falls outside [${from}, ${to})`,
    );
  }
}

test("the window contains the whole ET day under EDT (UTC-4)", () => {
  assertContainsWholeDay("2026-08-20");
});

test("the window contains the whole ET day under EST (UTC-5)", () => {
  assertContainsWholeDay("2026-01-15");
});

test("the window survives both DST transitions", () => {
  // A fixed UTC offset would be wrong on one side of each of these. The spring
  // day is 23 hours long in ET and the autumn one is 25.
  assertContainsWholeDay("2026-03-08"); // spring forward
  assertContainsWholeDay("2026-11-01"); // fall back
});

test("the window opens at the day's own midnight UTC", () => {
  // ET is always behind UTC, so the ET day cannot begin before this instant and
  // the lower bound needs no offset of its own.
  assert.equal(dayWindow("2026-08-20").from, "2026-08-20T00:00:00Z");
});

test("the window is wider than the day it selects", () => {
  // It contains the ET day rather than equalling it, which is precisely why
  // every caller re-checks tradingDay() afterwards — and why a row limit applied
  // against this window truncates the wrong set. Documented in queries.ts.
  const { from, to } = dayWindow("2026-08-20");
  assert.equal(Date.parse(to) - Date.parse(from), 36 * 3_600_000);
});

test("as-of cutoffs are ET midnight and 16:00, not the broad UTC query window", () => {
  assert.deepEqual(sessionDayTimes("2026-09-25"), { start: "2026-09-25T04:00:00.000Z", close: "2026-09-25T20:00:00.000Z" });
  assert.deepEqual(sessionDayTimes("2026-01-09"), { start: "2026-01-09T05:00:00.000Z", close: "2026-01-09T21:00:00.000Z" });
});

test("exact cutoffs handle an offset change between midnight and close", () => {
  assert.deepEqual(sessionDayTimes("2026-03-08"), { start: "2026-03-08T05:00:00.000Z", close: "2026-03-08T20:00:00.000Z" });
  assert.deepEqual(sessionDayTimes("2026-11-01"), { start: "2026-11-01T04:00:00.000Z", close: "2026-11-01T21:00:00.000Z" });
});
