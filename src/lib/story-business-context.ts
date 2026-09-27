import { db } from "./supabase.ts";
import { sessionDayTimes } from "./market.ts";
import type { StoryNewsItem } from "./story-input.ts";

/** Retained prior disclosures/news are context, never relabelled as today's catalyst. */
export async function loadBusinessContext(symbol: string, day: string): Promise<StoryNewsItem[]> {
  const { start } = sessionDayTimes(day);
  const since = new Date(new Date(start).getTime() - 30 * 86400000).toISOString();
  const { data, error } = await db.from("news")
    .select("headline,source_url,published_at,related_symbols,news_summaries(summary),news_evidence(source_text)")
    .contains("related_symbols", [symbol]).gte("published_at", since).lt("published_at", start)
    .order("published_at", { ascending: false }).limit(12);
  if (error) throw new Error(`business context for ${symbol}: ${error.message}`);
  const ranked = [...(data ?? [])].sort((a, b) => {
    const business = /earnings|revenue|guidance|profit|margin|order|contract|demand|launch|product|regulat|competition/i;
    return Number(business.test(b.headline as string)) - Number(business.test(a.headline as string));
  }).slice(0, 4);
  return ranked.map((r) => ({
    headline: r.headline as string, sourceUrl: r.source_url as string,
    publishedAt: r.published_at as string, relatedSymbols: r.related_symbols as string[],
    summary: (r.news_summaries as unknown as { summary: string } | null)?.summary ?? null,
    sourceText: (r.news_evidence as unknown as { source_text: string } | null)?.source_text ?? null,
  }));
}
