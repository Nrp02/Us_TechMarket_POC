import assert from "node:assert/strict";
import { test } from "node:test";

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://refresh-reads-test.invalid";
process.env.SUPABASE_SECRET_KEY = "test-key";
const { refreshMarketData } = await import("./refresh.ts");

test("a failing cached-price read is attempted once per budget slot before the job fails", async () => {
  const original = globalThis.fetch;
  const originalNow = Date.now;
  let priceCacheReads = 0;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.hostname !== "refresh-reads-test.invalid") throw new Error(`unexpected network: ${url.hostname}`);
    if (url.pathname.endsWith("/price_cache")) {
      priceCacheReads++;
      return new Response(JSON.stringify({ message: "upstream timeout" }), { status: 503 });
    }
    return Response.json([], { headers: { "content-range": "0-0/0" } });
  };
  try {
    Date.now = () => 0;
    await assert.rejects(refreshMarketData(), /refresh-avg-volume/);
    assert.equal(priceCacheReads, 3);
  } finally {
    globalThis.fetch = original;
    Date.now = originalNow;
  }
});
