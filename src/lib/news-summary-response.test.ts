import assert from "node:assert/strict";
import { test } from "node:test";
import { validateNewsSummaries } from "./news-summary-response.ts";

test("a reordered complete batch maps back by article id", () => {
  const actual = validateNewsSummaries({ summaries: [
    { id: "2", summary: "Second." }, { id: "1", summary: "First." },
  ] }, ["1", "2"]);
  assert.equal(actual.get("1"), "First.");
  assert.equal(actual.get("2"), "Second.");
});

test("a batch missing one article keeps every other summary", () => {
  const actual = validateNewsSummaries({ summaries: [
    { id: "1", summary: "First." }, { id: "3", summary: "Third." },
  ] }, ["1", "2", "3"]);
  assert.deepEqual([...actual.entries()], [["1", "First."], ["3", "Third."]]);
});

test("invented, duplicate and empty entries are dropped, never persisted", () => {
  const actual = validateNewsSummaries({ summaries: [
    { id: "1", summary: "First." },
    { id: "1", summary: "Again." },
    { id: "9", summary: "Invented." },
    { id: "2", summary: "  " },
  ] }, ["1", "2"]);
  assert.deepEqual([...actual.entries()], [["1", "First."]]);
});

test("a reply with no usable summary, or a malformed reply, throws", () => {
  assert.throws(() => validateNewsSummaries({ summaries: [{ id: "9", summary: "Invented." }] }, ["1"]));
  for (const data of [{ summaries: "nope" }, [{ id: "1", summary: "First." }], null]) {
    assert.throws(() => validateNewsSummaries(data, ["1"]));
  }
});
