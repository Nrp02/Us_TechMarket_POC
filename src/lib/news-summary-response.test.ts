import assert from "node:assert/strict";
import { test } from "node:test";
import { validateNewsSummaries } from "./news-summary-response.ts";

test("a reordered complete batch maps back by article id", () => {
  const actual = validateNewsSummaries({ summaries: [
    { id: "2", summary: "Second." }, { id: "1", summary: "First." },
  ] }, ["1", "2"]);
  assert.equal(actual.get("1"), "First.");
});

test("partial, duplicate, invented, empty and malformed batches cannot be persisted", () => {
  for (const data of [
    { summaries: [{ id: "1", summary: "First." }] },
    { summaries: [{ id: "1", summary: "First." }, { id: "1", summary: "Again." }] },
    { summaries: [{ id: "1", summary: "First." }, { id: "3", summary: "Invented." }] },
    { summaries: [{ id: "1", summary: "First." }, { id: "2", summary: " " }] },
    [{ id: "1", summary: "First." }], null,
  ]) assert.throws(() => validateNewsSummaries(data, ["1", "2"]));
});
