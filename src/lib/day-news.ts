// The one reader of a session day's news for the AI jobs and timelines. Every
// caller wants the same thing — the articles whose ET date is `day`, newest
// first, with the AI blurb and evidence excerpt attached — and a busy day
// outgrows a single PostgREST page (measured: 253 articles on 2026-09-04, and
// the 36-hour query window around it holds more). Paging, the ET-day filter
// and the embed coercion live here so no caller can forget one of them.
import { readAllRows } from "./db-read.ts";
import { dayWindow, tradingDay } from "./market.ts";
import { db } from "./supabase.ts";

export type DayNewsItem = {
  headline: string;
  sourceUrl: string;
  publishedAt: string;
  relatedSymbols: string[];
  /** The AI paraphrase, once news ingestion has written one. */
  summary: string | null;
  /** The stored article excerpt the paraphrase was grounded in. */
  sourceText: string | null;
};

/** Articles tagged with any of `symbols`, the general feed (no tickers), or every article. */
export type DayNewsFilter = { symbols: readonly string[] } | "general" | "all";

export const NEWS_WITH_EXCERPT_SELECT =
  "headline, source_url, published_at, related_symbols, news_summaries(summary), news_evidence(source_text)";

export type NewsWithExcerptRow = {
  headline: string;
  source_url: string;
  published_at: string;
  related_symbols: string[] | null;
  news_summaries: unknown;
  news_evidence: unknown;
};

/** news_id is the primary key of both embedded tables, so PostgREST embeds a single object. */
export function toNewsItem(row: NewsWithExcerptRow): DayNewsItem {
  return {
    headline: row.headline,
    sourceUrl: row.source_url,
    publishedAt: row.published_at,
    relatedSymbols: row.related_symbols ?? [],
    summary: (row.news_summaries as { summary?: string } | null)?.summary ?? null,
    sourceText: (row.news_evidence as { source_text?: string } | null)?.source_text ?? null,
  };
}

/** Newest first. Throws on a failed or incomplete read rather than returning a short day. */
export async function readDayNews(filter: DayNewsFilter, day: string): Promise<DayNewsItem[]> {
  const { from, to } = dayWindow(day);
  const label = `day-news:${day}:${filter === "all" || filter === "general" ? filter : filter.symbols.join(",")}`;
  const rows = await readAllRows<NewsWithExcerptRow>(label, (signal, start, end) => {
    let query = db
      .from("news")
      .select(NEWS_WITH_EXCERPT_SELECT, { count: "exact" });
    if (filter === "general") query = query.eq("related_symbols", "{}");
    else if (filter !== "all") query = query.overlaps("related_symbols", [...filter.symbols]);
    return query
      .gte("published_at", from)
      .lt("published_at", to)
      // id breaks ties so pages never overlap or skip a row.
      .order("published_at", { ascending: false })
      .order("id", { ascending: false })
      .range(start, end)
      .abortSignal(signal);
  });

  return rows
    .filter((row) => tradingDay(new Date(row.published_at)) === day)
    .map(toNewsItem);
}
