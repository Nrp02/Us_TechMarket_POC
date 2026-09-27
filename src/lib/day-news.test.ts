import assert from "node:assert/strict";
import { test } from "node:test";

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://day-news-test.invalid";
process.env.SUPABASE_SECRET_KEY = "test-key";
const { readDayNews } = await import("./day-news.ts");

type Row = Record<string, unknown>;
const article = (i: number, publishedAt: string, relatedSymbols: string[] = ["NVDA"]): Row => ({
  headline: `h${i}`,
  source_url: `https://example.com/${i}`,
  published_at: publishedAt,
  related_symbols: relatedSymbols,
  news_summaries: { summary: `s${i}` },
  news_evidence: null,
});

/** Serves `rows` the way PostgREST pages them, recording each request's query string. */
async function withFakeNews<T>(rows: Row[], run: (requests: URLSearchParams[]) => Promise<T>): Promise<T> {
  const original = globalThis.fetch;
  const requests: URLSearchParams[] = [];
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    requests.push(url.searchParams);
    const offset = Number(url.searchParams.get("offset") ?? 0);
    const limit = Number(url.searchParams.get("limit") ?? rows.length);
    const page = rows.slice(offset, offset + limit);
    return new Response(JSON.stringify(page), {
      headers: {
        "content-type": "application/json",
        "content-range": `${offset}-${offset + page.length - 1}/${rows.length}`,
      },
    });
  };
  try {
    return await run(requests);
  } finally {
    globalThis.fetch = original;
  }
}

test("keeps only articles whose ET date is the session day", async () => {
  const rows = [
    article(1, "2026-09-25T03:59:00Z"), // 23:59 ET on the 24th
    article(2, "2026-09-25T04:00:00Z"), // 00:00 ET on the 25th
    article(3, "2026-09-26T03:59:00Z"), // 23:59 ET on the 25th
    article(4, "2026-09-26T04:00:00Z"), // the 26th
  ];
  const news = await withFakeNews(rows, () => readDayNews({ symbols: ["NVDA"] }, "2026-09-25"));
  assert.deepEqual(news.map((n) => n.headline), ["h2", "h3"]);
  assert.deepEqual(news[0], {
    headline: "h2",
    sourceUrl: "https://example.com/2",
    publishedAt: "2026-09-25T04:00:00Z",
    relatedSymbols: ["NVDA"],
    summary: "s2",
    sourceText: null,
  });
});

// Two story readers used a bare select, which PostgREST silently caps at 1000.
test("reads past PostgREST's 1000-row page", async () => {
  const rows = Array.from({ length: 1_250 }, (_, i) => article(i, "2026-09-25T15:00:00Z"));
  const news = await withFakeNews(rows, () => readDayNews({ symbols: ["NVDA"] }, "2026-09-25"));
  assert.equal(news.length, 1_250);
});

test("symbol, general and whole-day filters reach the query", async () => {
  const bySymbol = await withFakeNews([], async (r) => (await readDayNews({ symbols: ["NVDA", "AMD"] }, "2026-09-25"), r));
  assert.equal(bySymbol[0].get("related_symbols"), "ov.{NVDA,AMD}");
  const general = await withFakeNews([], async (r) => (await readDayNews("general", "2026-09-25"), r));
  assert.equal(general[0].get("related_symbols"), "eq.{}");
  const all = await withFakeNews([], async (r) => (await readDayNews("all", "2026-09-25"), r));
  assert.equal(all[0].get("related_symbols"), null);
  assert.match(all[0].get("order") ?? "", /^published_at\.desc/);
});
