import { fetchAllNews, type RawArticle } from "@/lib/finnhub-news";
import { SAFETY_RULES } from "@/lib/gemini";
import { generateNewsJson } from "@/lib/openrouter";
import { validateNewsSummaries } from "@/lib/news-summary-response";
import { selectForSummary } from "@/lib/news-select";
import { readRows } from "@/lib/db-read";
import { db } from "@/lib/supabase";
import { TRACKED_STOCK_SYMBOLS } from "@/lib/symbols";

// One ingestion cycle: fetch -> store every new article -> ONE batched news AI
// call blurbing as many of the un-blurbed ones as fit -> store those blurbs.
//
// Storing and summarising are deliberately separate steps, and storing goes
// first. They used to be one: the batch cap was applied before the upsert, so
// anything past the cap was never stored at all and the article was simply lost
// until a later cycle happened to re-fetch it. That silently cost the AI Daily
// Summary most of its input — measured at 55% of one day's articles missing
// when the end-of-day job ran, with six stocks told "no news" on a day they all
// had some. Storage is unbounded now; only the AI batch is capped.
//
// The displayed blurb must be an AI paraphrase, never Finnhub's raw snippet
// pasted through: the snippet is copyrighted source text and only ever travels
// into the prompt as input.

/** One free request per cycle: up to 600 blurbs/day across 12 proposed cycles.
 * Verified with a 50-article provider smoke test; storage is uncapped. */
const MAX_PER_CYCLE = 50;

/**
 * The route's own ceiling (its maxDuration is 60s). Bounds the AI call so a
 * hung or slow request is aborted with a reported failure — an article's
 * summary backfills on the next cycle — rather than the call running unbounded
 * until the platform kills the function mid-job.
 */
const JOB_BUDGET_MS = 55_000;

export type IngestResult = {
  fetched: number;
  alreadyStored: number;
  /** Articles written to `news` this cycle. No longer bounded by the batch cap. */
  stored: number;
  summarised: number;
  /**
   * Fetched articles that still carry no blurb once this cycle is done, and so
   * are candidates for the next one. Expected to be 0 in steady state; a
   * non-zero value means either the batch cap bit or the AI call failed.
   */
  awaitingSummary: number;
  aiCalls: number;
  tokens: number | undefined;
  failed: string[];
};

export function buildNewsPrompt(articles: RawArticle[]): string {
  const items = articles.map((a) => ({
    id: String(a.finnhubId),
    headline: a.headline,
    source_text: a.snippet,
  }));

  return `You are summarising financial news articles for a stock-tracking dashboard.

For each article below, write a 2-3 sentence summary in your own words. Do not copy
phrasing from the headline or source_text — rewrite the substance in plain language.
Describe only what happened. If the source_text is empty or too thin to summarise,
base the summary solely on the headline and keep it to one sentence.

${SAFETY_RULES}

Return a JSON object with a "summaries" array containing one entry per article,
using the same id you were given. Each entry has string fields "id" and "summary".

Articles:
${JSON.stringify(items, null, 2)}`;
}

export async function ingestNews(): Promise<IngestResult> {
  const startedJobAt = Date.now();
  const failed: string[] = [];

  // Stock/sector categorisation is derived from the stored tags at read time.
  const { articles, errors } = await fetchAllNews(TRACKED_STOCK_SYMBOLS);
  failed.push(...errors);
  const result: IngestResult = {
    fetched: articles.length,
    alreadyStored: 0,
    stored: 0,
    summarised: 0,
    awaitingSummary: 0,
    aiCalls: 0,
    tokens: undefined,
    failed,
  };
  if (!articles.length) return result;

  // One read covering both questions this cycle has to answer: which articles
  // are already stored (so they are not written twice), and which of those
  // already carry a blurb (so they are not summarised twice). news_summaries'
  // primary key is news_id, so PostgREST embeds a single object here even though
  // the client's inferred type says array — the same caveat as queries.ts.
  const existing = await readRows<Record<string, unknown>>("news-ingest:existing", (signal) =>
    db.from("news")
      .select("id, finnhub_id, related_symbols, news_summaries(summary)")
      .in("finnhub_id", articles.map((a) => a.finnhubId))
      .abortSignal(signal).retry(false),
  );

  const newsIdByFinnhubId = new Map<number, number>();
  const hasSummary = new Set<number>();
  const relatedByFinnhubId = new Map<number, string[]>();
  for (const row of existing) {
    const finnhubId = Number(row.finnhub_id);
    newsIdByFinnhubId.set(finnhubId, row.id as number);
    relatedByFinnhubId.set(finnhubId, (row.related_symbols as string[] | null) ?? []);
    const embedded = row.news_summaries as unknown as { summary: string } | null;
    if (embedded?.summary) hasSummary.add(finnhubId);
  }

  // Store everything new, uncapped. This is the whole point of the split: the
  // article is on record before any AI call is attempted, so a slow, failed or
  // truncated AI request costs a blurb rather than the article itself.
  const fresh = articles.filter((a) => !newsIdByFinnhubId.has(a.finnhubId));
  result.alreadyStored = articles.length - fresh.length;
  // Expansion can discover additional company tags for an already stored article.
  // Keep its old tags and blurb, and persist the newly verified tags as well.
  const toStore = articles.filter((article) =>
    !newsIdByFinnhubId.has(article.finnhubId) ||
    article.relatedSymbols.some(symbol => !relatedByFinnhubId.get(article.finnhubId)?.includes(symbol)),
  );

  if (toStore.length) {
    const { data: inserted, error } = await db
      .from("news")
      .upsert(
        toStore.map((a) => ({
          finnhub_id: a.finnhubId,
          headline: a.headline,
          source_url: a.sourceUrl,
          image_url: a.imageUrl,
          related_symbols: [...new Set([...(relatedByFinnhubId.get(a.finnhubId) ?? []), ...a.relatedSymbols])],
          published_at: a.publishedAt.toISOString(),
        })),
        { onConflict: "finnhub_id" },
      )
      .select("id, finnhub_id");

    if (error) throw new Error(`news upsert: ${error.message}`);

    for (const row of inserted ?? []) {
      newsIdByFinnhubId.set(Number(row.finnhub_id), row.id as number);
    }
    result.stored = inserted?.length ?? 0;
  }

  const toSummarise = selectForSummary(articles, hasSummary, MAX_PER_CYCLE);
  const pending = articles.filter((a) => !hasSummary.has(a.finnhubId)).length;
  result.awaitingSummary = pending;
  // Preserve the actual provider snippet independently from the displayed paraphrase.
  const evidenceRows = articles.flatMap((article) => {
    const news_id = newsIdByFinnhubId.get(article.finnhubId);
    return news_id != null && article.snippet.trim()
      ? [{ news_id, source_text: article.snippet }] : [];
  });
  if (evidenceRows.length) {
    const { error } = await db.from("news_evidence").upsert(evidenceRows, { onConflict: "news_id" });
    if (error) throw new Error(`news evidence upsert: ${error.message}`);
  }
  if (!toSummarise.length) return result;

  // One AI attempt per cycle. A failed batch remains pending in the feed.
  let summaries = new Map<string, string>();
  try {
    result.aiCalls = 1;
    const { data, tokens } = await generateNewsJson(
      buildNewsPrompt(toSummarise),
      { timeoutMs: JOB_BUDGET_MS - (Date.now() - startedJobAt) },
    );
    result.tokens = tokens;
    summaries = validateNewsSummaries(data, toSummarise.map((a) => String(a.finnhubId)));
  } catch (error) {
    // The articles are already stored, so this costs blurbs and nothing else.
    // What must never happen is showing Finnhub's raw snippet instead.
    failed.push(error instanceof Error ? error.message : "news AI failed");
  }

  const summaryRows = toSummarise.flatMap((article) => {
    const summary = summaries.get(String(article.finnhubId));
    const newsId = newsIdByFinnhubId.get(article.finnhubId);
    return summary && newsId != null
      ? [{ news_id: newsId, summary, generated_at: new Date().toISOString() }]
      : [];
  });

  if (summaryRows.length) {
    const { error: summaryError } = await db
      .from("news_summaries")
      .upsert(summaryRows, { onConflict: "news_id" });
    if (summaryError) throw new Error(`news_summaries upsert: ${summaryError.message}`);
    result.summarised = summaryRows.length;
    result.awaitingSummary = pending - summaryRows.length;
  }

  return result;
}
