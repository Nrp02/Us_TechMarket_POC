import { test } from "node:test";
import assert from "node:assert/strict";
import { validatePublishedFigures, analysisSchema, hasSuppliedPercent, renderAnalysisPrompt, requireSections, runAllChecks, selectTopArticles, validateNoFlatMoves, validateTrendStated } from "./story-analysis-quality.ts";

test("schema requests published prose without model self-attestation", () => {
  const schema = analysisSchema(["explanation", "fundamentals"], { headlineSources: ["Chipmaker wins order"] });
  assert.deepEqual(schema.required, ["explanation", "fundamentals", "headline"]);
  assert.equal(schema.additionalProperties, false);
  assert.ok(!("analysisChecks" in schema.properties));
  assert.deepEqual((schema.properties.headline as { properties: { sourceHeadline: { enum: unknown[] } } }).properties.sourceHeadline.enum, ["Chipmaker wins order", null]);
});
test("section descriptions reach the schema; undescribed sections stay plain", () => {
  const schema = analysisSchema(["closingSynthesis", "breadth"], { descriptions: { closingSynthesis: "Year-to-date only." } });
  assert.deepEqual(schema.properties.closingSynthesis, { type: "string", description: "Year-to-date only." });
  assert.deepEqual(schema.properties.breadth, { type: "string" });
});
test("accepts exact figures and rejects invented or re-rounded percentages", () => {
  const prompt = { price: "+0.22%", peer: "+3.97%" };
  validatePublishedFigures({ explanation: "Price rose 0.22% while the peer gained 3.97%." }, prompt);
  assert.throws(() => validatePublishedFigures({ explanation: "The peer gained nearly 4%." }, prompt));
});
test("rejects internal source IDs in published prose", () => {
  const prompt = {};
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
test("feedback lands between the instructions and the input", () => {
  const prompt = { instructions: "Write it.\n", input: { a: 1 } };
  assert.equal(renderAnalysisPrompt(prompt), 'Write it.\n\nInput:\n{"a":1}');
  assert.equal(renderAnalysisPrompt(prompt, "Fix X.\n\n"), 'Write it.\n\nFix X.\n\nInput:\n{"a":1}');
});
test("the trend section must state direction, signed net change and swing age", () => {
  const trend = { direction: "downtrend", windowChangePercent: -5.03, reversalDaysAgo: 3 } as const;
  const errors = { direction: "no direction", age: "no age" };
  assert.doesNotThrow(() => validateTrendStated("A downtrend, net ‑5.03%, latest swing three trading days ago.", trend as never, errors));
  assert.throws(() => validateTrendStated("A downtrend, net 5.03%, three days ago.", trend as never, errors), /no direction/);
  assert.throws(() => validateTrendStated("A downtrend, net -5.03%.", trend as never, errors), /no age/);
  assert.doesNotThrow(() => validateTrendStated("anything", { direction: null } as never, errors));
});
test("top articles keep their original order and index", () => {
  const picks = selectTopArticles(["a", "B", "c", "D"], (s) => (s === s.toUpperCase() ? 1 : 0), 3);
  assert.deepEqual(picks, [{ item: "a", index: 0 }, { item: "B", index: 1 }, { item: "D", index: 3 }]);
});
test("requireSections names every empty section, headline included", () => {
  assert.throws(() => requireSections({ a: " ", b: "ok", headline: { text: "" } }, ["a", "b"], "Missing", true), { message: "Missing: a, headline.text" });
  assert.doesNotThrow(() => requireSections({ a: "x" }, ["a"], "Missing"));
});
test("non-breaking and other Unicode dashes count as minus signs", () => {
  assert.ok(hasSuppliedPercent("net window change of ‑5.03%", -5.03));
  assert.ok(hasSuppliedPercent("down −5.03%", -5.03));
});
