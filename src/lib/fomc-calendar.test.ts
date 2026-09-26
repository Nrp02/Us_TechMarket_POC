import assert from "node:assert/strict";
import { test } from "node:test";

import { isFomcDay, mostRecentDecision } from "./fomc-calendar.ts";

test("a scheduled decision day is recognized", () => {
  assert.equal(isFomcDay("2026-09-16"), true);
});

test("an ordinary trading day is not a decision day", () => {
  assert.equal(isFomcDay("2026-09-17"), false);
});

test("mostRecentDecision finds the latest decision at or before the day", () => {
  assert.equal(mostRecentDecision("2026-09-16"), "2026-09-16");
  assert.equal(mostRecentDecision("2026-09-20"), "2026-09-16");
});

test("mostRecentDecision is null before the year's first decision", () => {
  assert.equal(mostRecentDecision("2026-01-01"), null);
});
