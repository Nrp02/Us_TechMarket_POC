import { test } from "node:test";
import assert from "node:assert/strict";
import { validatePublishedFigures, analysisSchema, hasSuppliedPercent, runAllChecks, validateNoFlatMoves } from "./story-analysis-quality.ts";

test("schema requests published prose without model self-attestation", () => {
  const schema = analysisSchema(["explanation", "fundamentals"], true, ["Chipmaker wins order"]);
  assert.deepEqual(schema.required, ["explanation", "fundamentals", "headline"]);
  assert.equal(schema.additionalProperties, false);
  assert.ok(!("analysisChecks" in schema.properties));
  assert.deepEqual((schema.properties.headline as { properties: { sourceHeadline: { enum: unknown[] } } }).properties.sourceHeadline.enum, ["Chipmaker wins order", null]);
});
test("market schema scopes trend to volatility context", () => {
  const schema = analysisSchema(["closingSynthesis", "volatilityContext"]);
  assert.match((schema.properties.closingSynthesis as { description: string }).description, /Never mention recent trend/);
  assert.match((schema.properties.volatilityContext as { description: string }).description, /signed net window change/);
});
test("accepts exact figures and rejects invented or re-rounded percentages", () => {
  const prompt = "\nInput:\n" + JSON.stringify({ price: "+0.22%", peer: "+3.97%" });
  validatePublishedFigures({ explanation: "Price rose 0.22% while the peer gained 3.97%." }, prompt);
  assert.throws(() => validatePublishedFigures({ explanation: "The peer gained nearly 4%." }, prompt));
});
test("rejects internal source IDs in published prose", () => {
  const prompt = "\nInput:\n{}";
  for (const text of ["A deal (news:2) supports demand.", "News 0 explains the move."]) {
    assert.throws(() => validatePublishedFigures({ explanation: text }, prompt));
  }
});
test("recognizes positive percentages without a plus but preserves negative direction", () => {
  assert.ok(hasSuppliedPercent("net gain 6.69%", 6.69));
  assert.ok(hasSuppliedPercent("net +6.69%", 6.69));
  assert.ok(!hasSuppliedPercent("net −6.69%", 6.69));
  assert.ok(hasSuppliedPercent("net −7.54%", -7.54));
  assert.ok(!hasSuppliedPercent("net 7.54%", -7.54));
});

test("runAllChecks reports every failing check, not just the first", () => {
  assert.doesNotThrow(() => runAllChecks([() => {}, () => {}]));
  assert.throws(
    () => runAllChecks([() => { throw new Error("a"); }, () => {}, () => { throw new Error("b"); }]),
    { message: "a; b" },
  );
});
test("a nonzero named move is never flat", () => {
  const moves = [{ names: ["AMD"], changePercent: 0.22 }, { names: ["TXN"], changePercent: 0.04 }];
  assert.throws(() => validateNoFlatMoves({ peerSectorRelation: "AMD's flat move mirrors NVIDIA." }, moves), /AMD moved 0\.22%/);
  assert.doesNotThrow(() => validateNoFlatMoves({ comparison: "AMD's small +0.22% gain; TXN was essentially flat." }, moves));
  assert.doesNotThrow(() => validateNoFlatMoves({ comparison: "AMD rose while the index was flat." }, moves));
  assert.throws(() => validateNoFlatMoves({ comparison: "AMD (+0.22%) was essentially unchanged." }, moves));
});
test("closingSynthesis schema asks for year-to-date, other market cards stay on today", () => {
  const schema = analysisSchema(["overallRead", "closingSynthesis"]);
  assert.match((schema.properties.closingSynthesis as { description: string }).description, /Year-to-date/);
  assert.match((schema.properties.overallRead as { description: string }).description, /this session only/);
});
test("non-breaking and other Unicode dashes count as minus signs", () => {
  assert.ok(hasSuppliedPercent("net window change of ‑5.03%", -5.03));
  assert.ok(hasSuppliedPercent("down −5.03%", -5.03));
});
