import { db } from "./supabase.ts";
import { readRows } from "./db-read.ts";
import { NEWS_WITH_EXCERPT_SELECT, toNewsItem, type NewsWithExcerptRow } from "./day-news.ts";
import { sessionDayTimes } from "./market.ts";
import type { StoryNewsItem } from "./story-input.ts";

/** Retained prior disclosures/news are context, never relabelled as today's catalyst. */
export async function loadBusinessContext(symbol: string, day: string): Promise<StoryNewsItem[]> {
  const { start } = sessionDayTimes(day);
  const since = new Date(new Date(start).getTime() - 30 * 86400000).toISOString();
  const data = await readRows<NewsWithExcerptRow>(`business-context:${symbol}`, (signal) =>
    db.from("news")
      .select(NEWS_WITH_EXCERPT_SELECT)
      .contains("related_symbols", [symbol]).gte("published_at", since).lt("published_at", start)
      .order("published_at", { ascending: false }).limit(12).abortSignal(signal).retry(false),
  );
  const business = /earnings|revenue|guidance|profit|margin|order|contract|demand|launch|product|regulat|competition/i;
  return [...data]
    .sort((a, b) => Number(business.test(b.headline)) - Number(business.test(a.headline)))
    .slice(0, 4)
    .map(toNewsItem);
}
