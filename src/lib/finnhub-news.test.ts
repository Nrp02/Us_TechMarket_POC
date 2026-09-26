import assert from "node:assert/strict";
import { test } from "node:test";
import { fetchAllNews } from "./finnhub-news.ts";
import { mentionsSymbol, TRACKED_STOCK_SYMBOLS, NAME_BY_SYMBOL, TOP_20_SYMBOLS } from "./symbols.ts";

test("43 distinct stocks have names, with ambiguous ticker words excluded", () => {
  assert.equal(TRACKED_STOCK_SYMBOLS.length, 43);
  assert.equal(new Set(TRACKED_STOCK_SYMBOLS).size, 43);
  assert.equal(TOP_20_SYMBOLS.length, 20);
  for (const symbol of TRACKED_STOCK_SYMBOLS) {
    assert.ok(NAME_BY_SYMBOL.get(symbol));
    assert.ok(mentionsSymbol(symbol, NAME_BY_SYMBOL.get(symbol)!));
  }
  for (const symbol of ["AI", "F", "ON", "TEAM", "SNOW"]) {
    assert.equal(mentionsSymbol(symbol, "The team is on the AI project in the snow."), false);
  }
});

test("news workers are bounded and dedup retains extended-stock tags across feeds", async () => {
  const original = globalThis.fetch;
  let active = 0;
  let peak = 0;
  const called: string[] = [];
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    const symbol = url.searchParams.get("symbol");
    if (!symbol) return Response.json([]);
    called.push(symbol);
    peak = Math.max(peak, ++active);
    await new Promise(resolve => setTimeout(resolve, 1));
    active--;
    return Response.json([{
      id: 1, headline: "Nvidia and ASML announce devices", summary: "",
      url: "https://example.com/article", datetime: 1790000000, related: "",
    }]);
  };
  try {
    const result = await fetchAllNews(TRACKED_STOCK_SYMBOLS);
    assert.equal(called.length, 43);
    assert.ok(peak <= 5);
    assert.equal(result.errors.length, 0);
    assert.equal(result.articles.length, 1);
    assert.deepEqual(result.articles[0].relatedSymbols, ["NVDA", "ASML"]);
  } finally { globalThis.fetch = original; }
});

test("the shared fetch deadline stops stalled feeds before the ingestion AI budget", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (_input, init) => {
    const signal = init!.signal!;
    if (signal.aborted) throw signal.reason;
    return new Promise<Response>((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(signal.reason), { once: true });
      // Keep the mock transport alive until its signal fires.
      setTimeout(() => reject(new Error("deadline failed")), 100).unref();
    });
  };
  try {
    // Node's AbortSignal timer is unref'd, so keep this deterministic test alive.
    const keepAlive = setTimeout(() => {}, 100);
    try {
      const result = await fetchAllNews(TRACKED_STOCK_SYMBOLS, { timeoutMs: 5 });
      assert.equal(result.articles.length, 0);
      assert.equal(result.errors.length, 44);
    } finally { clearTimeout(keepAlive); }
  } finally { globalThis.fetch = original; }
});
