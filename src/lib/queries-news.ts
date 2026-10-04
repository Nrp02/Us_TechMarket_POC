import { unstable_cache } from "next/cache";

import { CACHE_SECONDS } from "@/lib/cache-policy";
import { readAllRows, readRows } from "@/lib/db-read";
import { dayWindow, tradingDay } from "@/lib/market";
import type { NewsCategory } from "@/lib/news-category";
import { newsRetentionCutoff } from "@/lib/news-retention";
import { SECTOR_BY_SYMBOL } from "@/lib/symbols";
import { db } from "@/lib/supabase";

// No `category` field: the thumbnail stopped needing one when market news
// started being identified by an empty `related_symbols`, and the tab filtering
// runs in Postgres in `getNews` below. `categoriseNews` still holds the rule and
// its tests, and the three filters there mirror it.
export type NewsItem = {
  id: number;
  headline: string;
  sourceUrl: string;
  relatedSymbols: string[];
  publishedAt: string;
  /** Always the AI paraphrase — Finnhub's own snippet is never displayed. */
  summary: string | null;
};

export const NEWS_COLUMNS =
  "id, headline, source_url, related_symbols, published_at, news_summaries(summary)";

// news_summaries.news_id is the primary key, so PostgREST embeds it as a single
// object rather than an array. Treating it as an array silently yields null.
export function toNewsItem(row: Record<string, unknown>): NewsItem {
  const embedded = row.news_summaries as { summary: string } | null;
  const relatedSymbols = (row.related_symbols as string[] | null) ?? [];
  return {
    id: row.id as number,
    headline: row.headline as string,
    sourceUrl: row.source_url as string,
    relatedSymbols,
    publishedAt: row.published_at as string,
    summary: embedded?.summary ?? null,
  };
}

/**
 * Latest first — the one fixed ordering; there is no sort control by design.
 *
 * The category filter is applied against the visitor's watchlist rather than a
 * stored column, so the tabs re-split the same stored articles per visitor. The
 * filter runs in Postgres so that `limit` still counts articles the tab will
 * actually show — and the date filter has to obey the same rule, which is what
 * the `if (!day)` below exists for.
 *
 * The invariant this protects: on any given day, All News is exactly the union
 * of Company, Industry and Market, and its count is the whole day. Three tabs
 * that add up to more than the tab containing them is the tell that a limit is
 * being applied against a set that is not the one being displayed.
 *
 * `day` scopes to one ET trading day, using the same dayWindow-plus-JS-filter
 * pattern as getSymbolNews and getIntraday below — the UTC window narrows the
 * query, and the exact ET boundary is settled after. Null (the default) applies
 * no date filter at all, which is what the Home teaser wants: it is not the
 * News page's "today" default, it is "most recent regardless of day".
 */
/**
 * The oldest ET day the News page will show: seven days ending on the newest
 * day that actually has an article, matching the seven days
 * `data-retention-cleanup` keeps in the database (0007_data_retention.sql,
 * guarded in 0008_retention_keep_last.sql).
 *
 * An ET *day* rather than a rolling `now - 7d` instant. Every other date rule
 * in this file works in whole trading days, and a sliding instant makes the
 * oldest day a partial one whose article count shrinks on every reload — the
 * picker would offer a date and then quietly show less of it each time. Whole
 * days also make the picker's seven entries exactly the seven days retained.
 *
 * A floor is still needed on top of the physical prune, because that job runs
 * once a day and the table legitimately holds more than a week between runs.
 * The rule itself lives in lib/news-retention.ts, where it is testable.
 */
/**
 * The newest ET day with a stored article, or null when the table is empty.
 *
 * One row, and read alongside the article query rather than before it — query
 * depth is what a page pays for (see CACHE_SECONDS above), so an extra query
 * that runs concurrently is close to free while a sequential one is not.
 */
async function getNewestNewsDayUncached(): Promise<string | null> {
  const rows = await readRows<{ published_at: string }>(
    "newest-news-day",
    (signal) =>
      db
        .from("news")
        .select("published_at")
        .order("published_at", { ascending: false })
        .limit(1)
        .abortSignal(signal).retry(false),
  );

  const newest = rows[0]?.published_at;
  return newest ? tradingDay(new Date(newest)) : null;
}

const getNewestNewsDay = unstable_cache(
  getNewestNewsDayUncached,
  ["news-newest-day"],
  { revalidate: CACHE_SECONDS },
);

export type NewsFilter = { sector?: string };

async function getNewsUncached(
  category?: NewsCategory,
  day?: string | null,
  limit = 60,
  filter?: NewsFilter,
): Promise<NewsItem[]> {
  // Day views paginate completely; teaser/all-date views retain the chosen cap.
  const buildQuery = (signal: AbortSignal, start = 0, end = 999) => {
    let query = db
      .from("news")
      .select(NEWS_COLUMNS, day ? { count: "exact" } : undefined)
      .order("published_at", { ascending: false })
      .order("id", { ascending: false });

    // Read all pages of the containing UTC window before applying the exact ET day.
    query = day ? query.range(start, end) : query.limit(limit);

    // An empty tag list is what identifies the general feed; everything else is
    // a Stock News article, optionally narrowed by one sector.
    if (category === "market") query = query.eq("related_symbols", "{}");
    if (category === "stock") query = query.neq("related_symbols", "{}");
    if (filter?.sector) {
      const sectorSymbols = Object.entries(SECTOR_BY_SYMBOL)
        .filter(([, sector]) => sector === filter.sector)
        .map(([symbol]) => symbol);
      query = query.overlaps("related_symbols", sectorSymbols);
    }

    if (day) {
      const { from, to } = dayWindow(day);
      query = query.gte("published_at", from).lt("published_at", to);
    }

    return query.abortSignal(signal).retry(false);
  };

  // The retention floor is applied here rather than as a SQL bound, because it
  // depends on the newest stored day and so is not known while the query is
  // being built. Nothing is lost: the rows are already ordered newest first, so
  // the limit still takes the newest `limit` articles and the floor only ever
  // trims a tail that failed it. That reasoning only holds because the limit
  // and the floor agree on an ordering; it is exactly the reasoning the day
  // filter broke, since a day is not a suffix of a newest-first list.
  const [rows, newestDay] = await Promise.all([
    day
      ? readAllRows<Record<string, unknown>>("news", buildQuery)
      : readRows<Record<string, unknown>>("news", buildQuery),
    getNewestNewsDay(),
  ]);
  const cutoff = newsRetentionCutoff(newestDay);

  const items = rows
    .map((row) => toNewsItem(row))
    .filter((item) => tradingDay(new Date(item.publishedAt)) >= cutoff);
  return day
    ? items.filter((item) => tradingDay(new Date(item.publishedAt)) === day)
    : items;
}

export const getNews = unstable_cache(getNewsUncached, ["news"], {
  revalidate: CACHE_SECONDS,
});

/**
 * Market News teaser on the Home page. Reuses the same ordering as the News
 * page rather than computing a second ranking of its own. Explicitly
 * date-unfiltered: the teaser's job is "most recent 3, whatever day", not
 * "today's 3" — a quiet morning before today's first news cycle should not
 * empty out the Home page.
 */
export async function getNewsTeaser(limit = 3): Promise<NewsItem[]> {
  return getNews(undefined, null, limit);
}

/**
 * Every ET trading day that has at least one stored article, most recent
 * first. Backs the News page's date filter.
 *
 * Asks Postgres for the distinct days (news_days(), migration 0009) rather than
 * selecting `published_at` from every row and collapsing them into a Set here,
 * which is what this did until it broke the page outright. PostgREST caps a
 * response at 1000 rows and the news table reached 1402 inside its own 7-day
 * retention window, so `readRows` correctly refused to render from partial data
 * and /news served the error boundary on every request. Retention was working;
 * the table just holds ~175 articles a day now, so a date bound would not have
 * helped — those 1402 rows already WERE the retained window. See the migration
 * for the full measurement.
 *
 * One row per day means the read is now bounded by the retention window rather
 * than by article volume, so it cannot approach the ceiling again.
 */
async function getNewsAvailableDatesUncached(): Promise<string[]> {
  // The count stays, and now it can never falsely fire: 1000 is the ceiling
  // rather than a chosen cap (db-read.ts states the rule), and the reply is at
  // most the handful of retained days.
  const rows = await readRows<{ day: string }>("news-dates", (signal) =>
    db
      .rpc("news_days", {}, { count: "exact" })
      .limit(1000)
      .abortSignal(signal).retry(false),
  );

  // Already DISTINCT and newest-first out of SQL, so the first row is the
  // anchor the floor is measured from — no second query is needed here.
  const cutoff = newsRetentionCutoff(rows[0]?.day ?? null);
  return rows.map((row) => row.day).filter((day) => day >= cutoff);
}

export const getNewsDates = unstable_cache(
  getNewsAvailableDatesUncached,
  ["news-dates"],
  { revalidate: CACHE_SECONDS },
);
