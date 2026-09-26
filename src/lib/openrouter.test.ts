import assert from "node:assert/strict";
import { test } from "node:test";
import { generateNewsJson, NEWS_MODEL } from "./openrouter.ts";

test("news AI uses pinned free Dots with no retry or fallback on 429", async () => {
  process.env.OPENROUTER_API_KEY = "test-key";
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (_input, init) => {
    calls++;
    const body = JSON.parse(String(init?.body));
    assert.equal(body.model, NEWS_MODEL);
    assert.equal(body.model, "dots-studio/dots-3-note-preview:free");
    assert.equal(body.reasoning.enabled, false);
    assert.equal(body.max_tokens, 8192);
    assert.equal(body.provider.allow_fallbacks, false);
    assert.equal(body.response_format.type, "json_schema");
    return Response.json({ error: { message: "upstream quota" } }, { status: 429 });
  };
  try {
    await assert.rejects(generateNewsJson("fixture", { timeoutMs: 1000 }), /OpenRouter 429/);
    assert.equal(calls, 1);
  } finally { globalThis.fetch = original; }
});

test("news AI parses a complete JSON reply and rejects truncated output", async () => {
  process.env.OPENROUTER_API_KEY = "test-key";
  const original = globalThis.fetch;
  let finishReason = "stop";
  const data = { summaries: [{ id: "1", summary: "A new product was released." }] };
  globalThis.fetch = async () => Response.json({ choices: [{ finish_reason: finishReason,
    message: { content: JSON.stringify(data) } }], usage: { total_tokens: 120 } });
  try {
    assert.deepEqual(await generateNewsJson("fixture", { timeoutMs: 1000 }), { data, tokens: 120 });
    finishReason = "length";
    await assert.rejects(generateNewsJson("fixture", { timeoutMs: 1000 }), /incomplete reply: length/);
  } finally { globalThis.fetch = original; }
});
