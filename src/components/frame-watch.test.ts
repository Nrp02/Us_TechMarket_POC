import assert from "node:assert/strict";
import { test } from "node:test";

import { createFrameWatch } from "./frame-watch.ts";

function feed(watch: ReturnType<typeof createFrameWatch>, gap: number, count: number) {
  const verdicts: string[] = [];
  for (let i = 0; i < count; i++) verdicts.push(watch.sample(gap));
  return verdicts;
}

test("a window of fast frames is ok all the way", () => {
  assert.deepEqual(new Set(feed(createFrameWatch(), 16, 270)), new Set(["ok"]));
});

test("a slow first window asks for a smaller buffer, and only on its last sample", () => {
  const verdicts = feed(createFrameWatch(), 50, 90);
  assert.equal(verdicts.at(-1), "shrink");
  assert.equal(verdicts.slice(0, -1).every((v) => v === "ok"), true);
});

test("a second slow window gives up, and a fast one in between does not reset the strikes", () => {
  const watch = createFrameWatch();
  assert.equal(feed(watch, 50, 90).at(-1), "shrink");
  assert.equal(feed(watch, 16, 90).at(-1), "ok");
  assert.equal(feed(watch, 50, 90).at(-1), "giveUp");
});

test("a window averaging exactly the threshold is not slow", () => {
  assert.equal(feed(createFrameWatch(), 40, 90).at(-1), "ok");
});
