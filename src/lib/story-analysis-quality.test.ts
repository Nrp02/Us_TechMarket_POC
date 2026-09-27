import { test } from "node:test";
import assert from "node:assert/strict";
import { validatePublishedFigures, analysisSchema, analysisContract, hasSuppliedPercent, runAllChecks } from "./story-analysis-quality.ts";

test("schema requests published prose without model self-attestation", () => {
  const schema = analysisSchema(["explanation", "fundamentals"], true, ["news:7"]);
  assert.deepEqual(schema.required, ["explanation", "fundamentals", "headline"]);
  assert.equal(schema.additionalProperties, false);
  assert.ok(!("analysisChecks" in schema.properties));
  assert.deepEqual((schema.properties.headline as { properties: { newsId: { enum: unknown[] } } }).properties.newsId.enum, ["news:7", null]);
});
test("market schema scopes trend to volatility context", () => {
  const schema = analysisSchema(["closingSynthesis", "volatilityContext"]);
  assert.match((schema.properties.closingSynthesis as { description: string }).description, /Never mention recent trend/);
  assert.match((schema.properties.volatilityContext as { description: string }).description, /signed net window change/);
});
test("contract requires evidence comparisons rather than metadata", () => {
  const contract = analysisContract(["marketEvents", "closingSynthesis"], ["closingSynthesis"]);
  assert.ok(!contract.includes("performanceEvidence"));
  assert.ok(!contract.includes("ytdTakeaway"));
  assert.match(contract, /alternative/);
  assert.match(contract, /unresolved/);
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
