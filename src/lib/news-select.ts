import type { RawArticle } from "@/lib/finnhub-news";

// Which of a cycle's fetched articles get handed to the news AI call.
//
// Its own module rather than living in news-ingest.ts, for the reason
// watchlist.ts records about next/headers: news-ingest.ts imports lib/supabase,
// which constructs the client at module load and throws without env vars, so a
// rule defined there cannot be loaded by the test runner at all. Every other
// pure rule in this codebase is split out the same way — see news-category.ts,
// significance.ts and timeline.ts.

/**
 * Newest first, which is what replaces an accidental priority order that caused
 * the bug this split was written for: the cap used to be applied to the fetched
 * list in its natural order, and `fetchAllNews` concatenates per-symbol feeds in
 * TOP_20_SYMBOLS order — so a busy day spent the whole cap on NVDA/AAPL/AMZN and
 * the tail of the list (CSCO, QCOM, MU, NOW...) got nothing, every cycle,
 * deterministically. Publication time, not feed position, decides now.
 *
 * The pool is every fetched article without a blurb, not just the ones inserted
 * this cycle — that is what lets a previously-stored-but-un-blurbed article be
 * picked up later. It only works while the article is still inside the fetch
 * window, which is fine because the blurb needs `snippet`, and `snippet` is
 * deliberately never stored (copyrighted source text, AI input only). An article
 * that ages out keeps its headline and stays usable everywhere — the daily
 * summary falls back to it.
 */
export function selectForSummary(
  fetched: RawArticle[],
  hasSummary: Set<number>,
  limit: number,
): RawArticle[] {
  return fetched
    .filter((a) => !hasSummary.has(a.finnhubId))
    .sort((a, b) => +b.publishedAt - +a.publishedAt)
    .slice(0, limit);
}
