import { test } from "node:test";
import assert from "node:assert/strict";
import { validateNoFlatMoves, validatePublishedFigures } from "./story-analysis-quality.ts";
import { readableCheck, warningsFor } from "./story-sections.ts";

const messageOf = (check: () => void) => {
  try { check(); } catch (error) { return (error as Error).message; }
  throw new Error("check passed");
};

test("real validator messages are reworded for readers", () => {
  const figure = messageOf(() => validatePublishedFigures({ explanation: "It fell 3.2%." }, { a: "-2.98%" }));
  const flat = messageOf(() => validateNoFlatMoves({ comparison: "PLTR was flat." }, [{ names: ["PLTR"], changePercent: -1.15 }]));
  const checks = { shown: [figure, flat], logged: [] };
  assert.deepEqual(warningsFor(checks, "explanation"), ["3.2% does not appear in the source data."]);
  assert.deepEqual(warningsFor(checks, "comparison"), ["PLTR moved -1.15%; it was not flat."]);
});

test("an unrecognised message is shown unchanged, not dropped", () => {
  assert.equal(readableCheck("something new"), "something new");
});
