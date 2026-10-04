import assert from "node:assert/strict";
import { test } from "node:test";

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://timeline-rebuild-test.invalid";
process.env.SUPABASE_SECRET_KEY = "test-key";
const { rebuildTimelines } = await import("./timeline-rebuild.ts");

test("a rebuild replaces a symbol's day in one database call, never a delete-then-insert pair", async () => {
  const original = globalThis.fetch;
  const requests: { method: string; path: string; body: unknown }[] = [];
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.hostname !== "timeline-rebuild-test.invalid") throw new Error(`unexpected network: ${url.hostname}`);
    requests.push({
      method: init?.method ?? "GET",
      path: url.pathname,
      body: init?.body ? JSON.parse(String(init.body)) : null,
    });
    return Response.json(null);
  };
  try {
    const data = {
      bySymbol: new Map([["NVDA", {
        snapshots: [
          { at: new Date("2026-09-25T13:30:00Z"), price: 100, volume: 1000 },
          { at: new Date("2026-09-25T14:00:00Z"), price: 101, volume: 1200 },
        ],
        news: [],
      }]]),
      truncated: [],
    };
    const result = await rebuildTimelines(["NVDA"], "2026-09-25", { data });
    assert.deepEqual(result.timelines, ["NVDA"]);

    const writes = requests.filter((r) => r.method !== "GET");
    assert.equal(writes.length, 1, `expected one write, got ${writes.map((w) => `${w.method} ${w.path}`).join(", ")}`);
    assert.equal(writes[0].path, "/rest/v1/rpc/replace_timeline_events");
    assert.deepEqual(writes[0].body, {
      p_symbols: ["NVDA"],
      p_day: "2026-09-25",
      p_rows: (writes[0].body as { p_rows: unknown[] }).p_rows,
    });
    assert.ok((writes[0].body as { p_rows: unknown[] }).p_rows.length > 0);
  } finally {
    globalThis.fetch = original;
  }
});
