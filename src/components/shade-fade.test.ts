import assert from "node:assert/strict";
import { test } from "node:test";

import { createShadeFade } from "./shade-fade.ts";

test("with nothing measured before, there is nothing to fade from", () => {
  const fade = createShadeFade<string>(350);
  fade.change(null, 0);
  assert.equal(fade.from(), null);
  assert.equal(fade.mix(100), 1);
});

test("a change fades from the shade last shown, eased, and drops it at the end", () => {
  const fade = createShadeFade<string>(350);
  fade.change("old", 1000);
  assert.equal(fade.from(), "old");
  assert.equal(fade.mix(1000), 0);
  assert.equal(fade.mix(1175), 0.5);
  assert.equal(fade.mix(1350), 1);
  assert.equal(fade.from(), null);
});

test("a second change during the fade keeps fading from the same shade, with at most half the fade to go", () => {
  const fade = createShadeFade<string>(350);
  fade.change("old", 1000);
  fade.change("middle", 1300);
  assert.equal(fade.from(), "old");
  assert.equal(fade.mix(1300), 0.5);
  assert.equal(fade.mix(1475), 1);
  assert.equal(fade.from(), null);
});
