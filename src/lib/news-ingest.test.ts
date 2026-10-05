import assert from "node:assert/strict";
import { test } from "node:test";
import { NAME_BY_SYMBOL, TRACKED_STOCK_SYMBOLS } from "./symbols.ts";

type Row = { id: number; finnhub_id: number; headline: string; related_symbols: string[]; published_at: string };

test("the blurb queue lives in the database and carries over between cycles", async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://news-test.invalid";
  process.env.SUPABASE_SECRET_KEY = "test-key";
  process.env.OPENROUTER_API_KEY = "test-key";
  const { ingestNews } = await import("./news-ingest.ts");
  const original = globalThis.fetch;

  // An in-memory stand-in for the three tables the job touches.
  let news = new Map<number, Row>();
  let evidence = new Map<number, string>();
  let summaries = new Map<number, string>();
  const reset = () => { news = new Map(); evidence = new Map(); summaries = new Map(); };

  let feed: "normal" | "busy" | "empty" = "normal";
  let completeBatch = false;
  let aiAttempts = 0;
  let sentToAi: string[] = [];

  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.hostname === "finnhub.io") {
      const symbol = url.searchParams.get("symbol");
      const index = TRACKED_STOCK_SYMBOLS.indexOf(symbol ?? "");
      if (!symbol || feed === "empty") return Response.json([]);
      const ids = [index + 1, ...(feed === "busy" && index < 17 ? [index + 101] : [])];
      return Response.json(ids.map(id => ({
        id,
        headline: `${NAME_BY_SYMBOL.get(symbol)} announces a device`,
        summary: "A device was announced.", related: symbol,
        url: `https://example.com/${symbol}/${id}`, datetime: 1790000000 + id,
      })));
    }
    if (url.hostname === "news-test.invalid") {
      const table = url.pathname.split("/").pop();
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      if (table === "news" && init?.method === "POST") {
        for (const row of body) news.set(row.finnhub_id, { ...row, id: row.finnhub_id });
        return Response.json(body.map((row: Row) => ({ id: row.finnhub_id, finnhub_id: row.finnhub_id })));
      }
      if (table === "news_evidence" && init?.method === "POST") {
        for (const row of body) evidence.set(row.news_id, row.source_text);
        return Response.json([]);
      }
      if (table === "news_summaries" && init?.method === "POST") {
        for (const row of body) summaries.set(row.news_id, row.summary);
        return Response.json([]);
      }
      if (table === "news" && url.searchParams.get("news_summaries") === "is.null") {
        const pending = [...news.values()]
          .filter(row => !summaries.has(row.id))
          .sort((a, b) => b.published_at.localeCompare(a.published_at));
        const page = pending.slice(0, Number(url.searchParams.get("limit")));
        return Response.json(
          page.map(row => ({ ...row, news_summaries: null, news_evidence: evidence.has(row.id) ? { source_text: evidence.get(row.id) } : null })),
          { headers: { "Content-Range": `0-${Math.max(page.length - 1, 0)}/${pending.length}` } },
        );
      }
      if (table === "news") {
        const wanted = url.searchParams.get("finnhub_id")?.replace(/^in\.\(|\)$/g, "").split(",").map(Number) ?? [];
        return Response.json(wanted.flatMap(id => news.has(id) ? [news.get(id)] : []));
      }
    }
    if (url.hostname === "openrouter.ai") {
      aiAttempts++;
      const body = JSON.parse(String(init?.body));
      const articles: { id: string }[] = JSON.parse(body.messages[0].content.split("Articles:\n")[1]);
      sentToAi = articles.map(a => a.id);
      for (const id of sentToAi) assert.ok(news.has(Number(id)), "articles must be stored before AI");
      const reply = (completeBatch ? articles : articles.slice(0, 1))
        .map(a => ({ id: a.id, summary: "A device was introduced." }));
      return Response.json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ summaries: reply }) } }] });
    }
    throw new Error(`Unexpected network access: ${url.hostname}`);
  };

  try {
    // The model leaves out 42 of 43: the one it returned is kept, the rest stay queued.
    const partial = await ingestNews();
    assert.equal(partial.stored, 43);
    assert.equal(partial.summarised, 1);
    assert.equal(partial.awaitingSummary, 42);
    assert.deepEqual(partial.failed, []);

    // Next cycle: nothing new is fetched as new, and the 42 left over are blurbed.
    completeBatch = true;
    const carried = await ingestNews();
    assert.equal(carried.alreadyStored, 43);
    assert.equal(carried.stored, 0);
    assert.equal(carried.summarised, 42);
    assert.equal(carried.awaitingSummary, 0);

    // Nothing pending: no AI call is spent.
    aiAttempts = 0;
    const idle = await ingestNews();
    assert.equal(idle.aiCalls, 0);
    assert.equal(aiAttempts, 0);

    // A newly verified tag is merged into an already stored article.
    news.get(1)!.related_symbols = ["ASML"];
    await ingestNews();
    assert.deepEqual(news.get(1)!.related_symbols, ["ASML", TRACKED_STOCK_SYMBOLS[0]]);

    // A busy cycle: storage is uncapped, the AI batch takes the newest 50.
    reset();
    feed = "busy";
    aiAttempts = 0;
    const busy = await ingestNews();
    assert.equal(busy.stored, 60, "storage remains uncapped");
    assert.equal(busy.summarised, 50);
    assert.equal(busy.awaitingSummary, 10);
    assert.equal(aiAttempts, 1, "a busy cycle still consumes one free request");
    assert.ok(sentToAi.includes("117") && !sentToAi.includes("1"), "newest first");

    // The 10 left over are blurbed even after they leave Finnhub's window.
    feed = "empty";
    const drained = await ingestNews();
    assert.equal(drained.fetched, 0);
    assert.equal(drained.summarised, 10);
    assert.equal(drained.awaitingSummary, 0);
    assert.equal(summaries.size, 60);
  } finally { globalThis.fetch = original; }
});
