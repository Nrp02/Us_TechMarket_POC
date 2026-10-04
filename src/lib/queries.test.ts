import assert from "node:assert/strict";
import { test } from "node:test";
import { AsyncLocalStorage } from "node:async_hooks";

Object.assign(globalThis, { AsyncLocalStorage });

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://queries-test.invalid";
process.env.SUPABASE_SECRET_KEY = "test-key";
const { getNewsDates } = await import("./queries.ts");

test("a failed news-dates read throws and is not cached, so the next request reads again", async () => {
  const runtime = globalThis as typeof globalThis & { __incrementalCache?: unknown };
  const originalCache = runtime.__incrementalCache;
  const entries = new Map<string, unknown>();
  runtime.__incrementalCache = {
    generateSimpleCacheKey: async (key: string) => key,
    get: async (key: string) => entries.has(key) ? { value: entries.get(key), isStale: false } : null,
    set: async (key: string, value: unknown) => { entries.set(key, value); },
  };
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    if (calls <= 3) return new Response(JSON.stringify({ message: "upstream timeout" }), { status: 503 });
    return Response.json([{ day: "2026-09-25" }], { headers: { "content-range": "0-0/1" } });
  };
  try {
    await assert.rejects(getNewsDates(), /news-dates/);
    assert.deepEqual(await getNewsDates(), ["2026-09-25"]);
  } finally {
    globalThis.fetch = original;
    runtime.__incrementalCache = originalCache;
  }
});
