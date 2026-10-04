import assert from "node:assert/strict";
import { test } from "node:test";

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://market-story-test.invalid";
process.env.SUPABASE_SECRET_KEY = "test-key";
process.env.GROQ_API_KEY = "test-key";
const { generateMarketStory } = await import("./market-story-generation.ts");

test("an unreadable existing-story check fails the market job instead of re-drafting the day", async () => {
  const original = globalThis.fetch;
  let groqCalls = 0;
  let existingAttempts = 0;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.hostname === "api.groq.com") { groqCalls++; return Response.json({}); }
    if (url.hostname !== "market-story-test.invalid") throw new Error(`unexpected network: ${url.hostname}`);
    const table = url.pathname.split("/").pop()!;
    if (table === "market_stories") {
      existingAttempts++;
      return new Response(JSON.stringify({ message: "upstream timeout" }), { status: 503 });
    }
    return Response.json([], { headers: { "content-range": "0-0/0" } });
  };
  try {
    await assert.rejects(generateMarketStory("2026-09-25"), /market-story:existing/);
    assert.equal(existingAttempts, 3);
    assert.equal(groqCalls, 0);
  } finally {
    globalThis.fetch = original;
  }
});
