import assert from "node:assert/strict";
import { test } from "node:test";

import { BRIGHT, DIM, DUST, FAR, isAnchor } from "./sky-field.ts";

test("the seven constellation anchors are bright stars, found by position", () => {
  const anchors = BRIGHT.filter(([x, y]) => isAnchor(x, y));
  assert.equal(anchors.length, 7);
});

test("no star outside the bright tier is an anchor", () => {
  assert.equal(DIM.filter(([x, y]) => isAnchor(x, y)).length, 0);
  assert.equal(DUST.filter(([x, y]) => isAnchor(x, y)).length, 0);
});

test("the tiers keep their authored size", () => {
  assert.equal(BRIGHT.length, 18);
  assert.equal(FAR.length, 700);
});
