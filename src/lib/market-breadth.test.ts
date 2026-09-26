import assert from "node:assert/strict";
import { test } from "node:test";

import { computeBreadth, computeSectorAverages } from "./market-breadth.ts";

test("all advancing", () => {
  const breadth = computeBreadth([
    { changePercent: 1, significant: false },
    { changePercent: 2, significant: false },
  ]);
  assert.equal(breadth.advancers, 2);
  assert.equal(breadth.decliners, 0);
  assert.equal(breadth.unchanged, 0);
  assert.equal(breadth.total, 2);
});

test("all declining", () => {
  const breadth = computeBreadth([
    { changePercent: -1, significant: false },
    { changePercent: -2, significant: false },
  ]);
  assert.equal(breadth.advancers, 0);
  assert.equal(breadth.decliners, 2);
});

test("mixed, with an unchanged stock", () => {
  const breadth = computeBreadth([
    { changePercent: 1, significant: false },
    { changePercent: -1, significant: false },
    { changePercent: 0, significant: false },
  ]);
  assert.equal(breadth.advancers, 1);
  assert.equal(breadth.decliners, 1);
  assert.equal(breadth.unchanged, 1);
});

test("significantCount counts the significant flag, not a re-derived threshold", () => {
  const breadth = computeBreadth([
    { changePercent: 6, significant: true },
    { changePercent: 0.1, significant: false },
  ]);
  assert.equal(breadth.significantCount, 1);
});

test("an empty list yields all-zero breadth, not a crash", () => {
  const breadth = computeBreadth([]);
  assert.deepEqual(breadth, {
    advancers: 0,
    decliners: 0,
    unchanged: 0,
    total: 0,
    significantCount: 0,
  });
});

test("computeSectorAverages groups by sector and averages within it", () => {
  // NVDA and AMD are both Semiconductors; AAPL is Hardware/Devices.
  const averages = computeSectorAverages([
    { symbol: "NVDA", changePercent: 2 },
    { symbol: "AMD", changePercent: 4 },
    { symbol: "AAPL", changePercent: 1 },
  ]);
  const semis = averages.find((a) => a.sector === "Semiconductors");
  const hardware = averages.find((a) => a.sector === "Hardware/Devices");
  assert.equal(semis?.averageChangePercent, 3);
  assert.equal(semis?.count, 2);
  assert.equal(hardware?.averageChangePercent, 1);
  assert.equal(hardware?.count, 1);
});

test("computeSectorAverages' per-stock breakdown is sorted highest change first", () => {
  const averages = computeSectorAverages([
    { symbol: "NVDA", changePercent: 2 },
    { symbol: "AMD", changePercent: 4 },
    { symbol: "AVGO", changePercent: -1 },
  ]);
  const semis = averages.find((a) => a.sector === "Semiconductors");
  assert.deepEqual(
    semis?.stocks.map((s) => s.symbol),
    ["AMD", "NVDA", "AVGO"],
  );
});

test("a symbol outside SECTOR_BY_SYMBOL is skipped, not fabricated a sector", () => {
  const averages = computeSectorAverages([{ symbol: "QQQ", changePercent: 5 }]);
  assert.deepEqual(averages, []);
});
