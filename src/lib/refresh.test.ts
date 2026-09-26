import assert from "node:assert/strict";
import { test } from "node:test";
import { CIK_BY_SYMBOL, EXTENDED_SYMBOLS, TOP_20_SYMBOLS } from "./symbols.ts";

test("refresh writes 49 prices/snapshots while keeping metrics, earnings and SEC Top-20-only", async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://refresh-test.invalid";
  process.env.SUPABASE_SECRET_KEY = "test-key";
  const { refreshMarketData } = await import("./refresh.ts");
  const original = globalThis.fetch;
  const metrics: string[] = [];
  const earnings: string[] = [];
  const ciks: string[] = [];
  let prices: { symbol: string; avg_volume: number | null }[] = [];
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.hostname === "refresh-test.invalid") {
      if (init?.method === "POST") {
        if (url.pathname.endsWith("/price_cache")) prices = JSON.parse(String(init.body));
        return Response.json([]);
      }
      return Response.json([]);
    }
    if (url.hostname === "finnhub.io") {
      const symbol = url.searchParams.get("symbol")!;
      if (url.pathname.endsWith("/quote")) return Response.json({ c: 100, d: 1, dp: 1 });
      if (url.pathname.endsWith("/metric")) {
        metrics.push(symbol);
        return Response.json({ metric: { "10DayAverageTradingVolume": 1 } });
      }
      if (url.pathname.endsWith("/earnings")) { earnings.push(symbol); return Response.json([]); }
    }
    if (url.hostname === "query1.finance.yahoo.com") return Response.json({
      chart: { result: [{ meta: { regularMarketVolume: 100 }, timestamp: [1790000000],
        indicators: { quote: [{ close: [100], volume: [100] }] } }] },
    });
    if (url.hostname === "data.sec.gov") {
      ciks.push(url.pathname);
      return Response.json({ filings: { recent: { form: [], filingDate: [], accessionNumber: [], items: [] } } });
    }
    throw new Error(`Unexpected network access: ${url.hostname}`);
  };
  try {
    const result = await refreshMarketData();
    assert.equal(result.symbols, 49);
    assert.equal(result.prices, 49);
    assert.equal(result.snapshots, 49);
    assert.deepEqual(result.failed, []);
    assert.deepEqual([...metrics].sort(), [...TOP_20_SYMBOLS].sort());
    assert.deepEqual([...earnings].sort(), [...TOP_20_SYMBOLS].sort());
    assert.equal(ciks.length, 20);
    assert.ok(ciks.every(path => Object.values(CIK_BY_SYMBOL).some(cik => path.includes(cik.padStart(10, "0")))));
    for (const symbol of EXTENDED_SYMBOLS) assert.equal(prices.find(row => row.symbol === symbol)?.avg_volume, null);
  } finally { globalThis.fetch = original; }
});
