import assert from "node:assert/strict";
import { test } from "node:test";

import { activityDateLabel, buildActivityDateOptions, resolveActivityDay } from "./activity-date.ts";

test("a valid requested day is returned as-is", () => {
  assert.equal(resolveActivityDay("2026-09-24", ["2026-09-25", "2026-09-24"]), "2026-09-24");
});

test("a missing or stale requested day falls back to undefined, not a broken page", () => {
  assert.equal(resolveActivityDay(undefined, ["2026-09-25"]), undefined);
  assert.equal(resolveActivityDay("2020-01-01", ["2026-09-25"]), undefined);
});

test("buildActivityDateOptions marks the current day and labels today specially", () => {
  const options = buildActivityDateOptions(
    ["2026-09-25", "2026-09-24"],
    "2026-09-24",
    "2026-09-25",
    (d) => `/x?date=${d}`,
  );
  assert.equal(options[0].label, "Today");
  assert.equal(options[0].current, false);
  assert.equal(options[1].current, true);
});

test("activityDateLabel", () => {
  assert.equal(activityDateLabel("2026-09-25", "2026-09-25"), "Today");
  // formatDay includes the weekday — Thu, Sep 24, 2026.
  assert.equal(activityDateLabel("2026-09-24", "2026-09-25"), "Thu, Sep 24");
});
