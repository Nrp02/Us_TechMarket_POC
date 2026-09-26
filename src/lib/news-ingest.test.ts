import assert from "node:assert/strict";
import { test } from "node:test";
import { NAME_BY_SYMBOL, TRACKED_STOCK_SYMBOLS } from "./symbols.ts";

test("ingestion stores all 43 feeds before AI and rejects a partial batch without writing blurbs", async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://news-test.invalid";
  process.env.SUPABASE_SECRET_KEY = "test-key";
  process.env.OPENROUTER_API_KEY = "test-key";
  const { ingestNews } = await import("./news-ingest.ts");
  const original = globalThis.fetch;
  let stored = 0;
  let blurbWrites = 0;
  let aiAttempts = 0;
  let completeBatch = false;
  let existingArticle = false;
  let existingTags: string[] = [];
  let highVolume = false;
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.hostname === "finnhub.io") {
      const symbol = url.searchParams.get("symbol");
      const index = TRACKED_STOCK_SYMBOLS.indexOf(symbol ?? "");
      const ids = symbol ? [index + 1, ...(highVolume && index < 17 ? [index + 101] : [])] : [];
      return Response.json(ids.map(id => ({
        id,
        headline: `${NAME_BY_SYMBOL.get(symbol ?? "")} announces a device`,
        summary: "A device was announced.", related: symbol,
        url: `https://example.com/${symbol}`, datetime: 1790000000,
      })));
    }
    if (url.hostname === "news-test.invalid") {
      if (url.pathname.endsWith("/news") && init?.method === "POST") {
        const rows = JSON.parse(String(init.body));
        stored += rows.length;
        existingTags = rows.find((row: { finnhub_id: number }) => row.finnhub_id === 1)?.related_symbols ?? [];
        return Response.json(rows.map((row: { finnhub_id: number }) => ({ id: row.finnhub_id, finnhub_id: row.finnhub_id })));
      }
      if (url.pathname.endsWith("/news_summaries") && init?.method === "POST") {
        blurbWrites++;
        return Response.json([]);
      }
      return Response.json(existingArticle ? [{
        id: 1, finnhub_id: 1, related_symbols: ["ASML"],
        news_summaries: { summary: "Already summarised." },
      }] : []);
    }
    if (url.hostname === "openrouter.ai") {
      assert.equal(stored, highVolume ? 60 : 43, "articles must precede AI");
      aiAttempts++;
      const body = JSON.parse(String(init?.body));
      const articles = JSON.parse(body.messages[0].content.split("Articles:\n")[1]);
      const summaries = completeBatch
        ? articles.map((article: { id: string }) => ({ id: article.id, summary: "A device was introduced." }))
        : [{ id: "1", summary: "A device was introduced." }];
      return Response.json({ choices: [{ finish_reason: "stop", message: { content:
        JSON.stringify({ summaries }),
      } }] });
    }
    throw new Error(`Unexpected network access: ${url.hostname}`);
  };
  try {
    const result = await ingestNews();
    assert.equal(result.stored, 43);
    assert.equal(result.summarised, 0);
    assert.equal(result.awaitingSummary, 43);
    assert.equal(aiAttempts, 1);
    assert.equal(blurbWrites, 0);
    assert.ok(result.failed.some(message => message.includes("missing articles")));
    completeBatch = true;
    stored = 0;
    aiAttempts = 0;
    const success = await ingestNews();
    assert.equal(success.stored, 43);
    assert.equal(success.summarised, 43);
    assert.equal(success.awaitingSummary, 0);
    assert.equal(aiAttempts, 1);
    assert.equal(blurbWrites, 1);
    assert.deepEqual(success.failed, []);
    existingArticle = true;
    stored = 0;
    aiAttempts = 0;
    const expanded = await ingestNews();
    assert.equal(expanded.alreadyStored, 1);
    assert.deepEqual(existingTags, ["ASML", "NVDA"]);
    assert.equal(expanded.summarised, 42);
    assert.equal(expanded.awaitingSummary, 0);
    highVolume = true;
    existingArticle = false;
    stored = 0;
    aiAttempts = 0;
    const busy = await ingestNews();
    assert.equal(busy.stored, 60, "storage remains uncapped");
    assert.equal(busy.summarised, 50);
    assert.equal(busy.awaitingSummary, 10);
    assert.equal(aiAttempts, 1, "a busy cycle still consumes one free request");
  } finally { globalThis.fetch = original; }
});
