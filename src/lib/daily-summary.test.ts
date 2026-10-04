import assert from "node:assert/strict";
import { test } from "node:test";
import { TOP_20_SYMBOLS } from "./symbols.ts";

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://daily-summary-test.invalid";
process.env.SUPABASE_SECRET_KEY = "test-key";
process.env.GEMINI_API_KEY = "test-key";
const { generateDailySummaries } = await import("./daily-summary.ts");

const DAY = "2026-09-25";

function tickerRows() {
  return TOP_20_SYMBOLS.map((symbol) => ({
    symbol, price: 100, change: 1, change_percent: 1, volume: null, avg_volume: null, updated_at: "2026-09-25T20:15:00Z",
  }));
}

function withFakeNetwork(
  routes: Record<string, (url: URL) => Response>,
  run: (geminiCalls: () => number) => Promise<void>,
) {
  return async () => {
    const original = globalThis.fetch;
    let gemini = 0;
    globalThis.fetch = async (input) => {
      const url = new URL(String(input));
      if (url.hostname === "generativelanguage.googleapis.com") {
        gemini++;
        return Response.json({ candidates: [{ content: { parts: [{ text: "[]" }] }, finishReason: "STOP" }] });
      }
      if (url.hostname !== "daily-summary-test.invalid") throw new Error(`unexpected network: ${url.hostname}`);
      const table = url.pathname.split("/").pop()!;
      const route = routes[table];
      if (!route) return Response.json([], { headers: { "content-range": "0-0/0" } });
      return route(url);
    };
    try { await run(() => gemini); } finally { globalThis.fetch = original; }
  };
}

function rowsResponse(rows: object[]) {
  return Response.json(rows, { headers: { "content-range": `0-${Math.max(rows.length - 1, 0)}/${rows.length}` } });
}

const liveRoutes = {
  price_cache: () => rowsResponse(tickerRows()),
  intraday_snapshots: () => rowsResponse([{ snapshot_at: "2026-09-25T20:00:00Z" }]),
};

test("a stock whose summary already exists is not sent to Gemini again", withFakeNetwork(
  {
    ...liveRoutes,
    daily_summaries: () => rowsResponse(TOP_20_SYMBOLS.map((symbol) => ({ symbol }))),
  },
  async (geminiCalls) => {
    const result = await generateDailySummaries(DAY);
    assert.equal(result.alreadyDone, TOP_20_SYMBOLS.length);
    assert.deepEqual(result.generated, []);
    assert.equal(geminiCalls(), 0);
  },
));

test("a failed read of finished summaries throws instead of treating every stock as pending", withFakeNetwork(
  {
    ...liveRoutes,
    daily_summaries: () => Response.json({ message: "upstream down" }, { status: 500 }),
  },
  async (geminiCalls) => {
    await assert.rejects(generateDailySummaries(DAY), /daily-summary-done/);
    assert.equal(geminiCalls(), 0);
  },
));
