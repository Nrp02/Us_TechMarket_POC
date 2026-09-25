import assert from "node:assert/strict";
import { test } from "node:test";

import { computePeerComparison } from "./peer-comparison.ts";

test("peer average is the plain mean of the peers' change%", () => {
  const { peerAveragePercent } = computePeerComparison(3, [1, 2, 3]);
  assert.equal(peerAveragePercent, 2);
});

test("vsPeers is the stock's change minus the peer average", () => {
  const { vsPeersPercent } = computePeerComparison(5, [1, 3]);
  assert.equal(vsPeersPercent, 3);
});

test("a stock lagging its peers reads negative", () => {
  const { vsPeersPercent } = computePeerComparison(1, [4, 6]);
  assert.equal(vsPeersPercent, -4);
});

test("no peers with a known price yields null, never zero", () => {
  const result = computePeerComparison(5, []);
  assert.equal(result.peerAveragePercent, null);
  assert.equal(result.vsPeersPercent, null);
});

test("a single available peer is its own average", () => {
  const { peerAveragePercent } = computePeerComparison(5, [2]);
  assert.equal(peerAveragePercent, 2);
});
