import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { PLANET_VARS } from "./planet-contract.ts";

const css = ["globals.css", "sky.css", "planet.css"]
  .map((f) => readFileSync(new URL(`../app/${f}`, import.meta.url), "utf8"))
  .join("\n");
const sources = ["saturn-webgl.ts", "saturn-stage.tsx"].map((f) =>
  readFileSync(new URL(f, import.meta.url), "utf8"),
);

test("every custom property the planet reads is declared or used by the stylesheets", () => {
  for (const name of PLANET_VARS) {
    assert.ok(css.includes(`${name}:`) || css.includes(`var(${name}`), `${name} is not in globals.css`);
  }
});

test("the planet's breakpoint is in the stylesheets, and its hidden case is the complement", () => {
  assert.ok(css.includes("@media (min-width: 700px) and (min-height: 500px)"), "planet media query missing from the stylesheets");
  assert.ok(css.includes("(max-width: 699.98px), (max-height: 499.98px)"), "phone hide query drifted");
});

test("the code reads no planet custom property that the contract does not list", () => {
  const read = new Set(sources.flatMap((s) => [...s.matchAll(/"(--(?:saturn|camera|color)-[a-z-]+)"/g)].map((m) => m[1])));
  for (const name of read) {
    assert.ok((PLANET_VARS as readonly string[]).includes(name), `${name} is read but not listed`);
  }
});
