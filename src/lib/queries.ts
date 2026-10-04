import { unstable_cache } from "next/cache";
import { cache } from "react";

import { readDailyCloses } from "@/lib/daily-closes";
import { readAllRows, readMaybeOne, readRows } from "@/lib/db-read";
import { dayWindow, tradingDay } from "@/lib/market";
import type { NewsCategory } from "@/lib/news-category";
import { newsRetentionCutoff } from "@/lib/news-retention";
import { computeSectorAverages, computeTopMovers } from "@/lib/market-breadth";
import { computePeerComparison, type PeerComparison } from "@/lib/peer-comparison";
import { computePeriodPerformance, type PeriodPerformance } from "@/lib/period-performance";
import {
  newestSnapshotAt,
  readPageSession,
  type Ticker,
} from "@/lib/session";
import { db } from "@/lib/supabase";
import { INDEX_SYMBOLS, PEERS, SECTOR_BY_SYMBOL, TRACKED_STOCK_SYMBOLS } from "@/lib/symbols";
import type { MarketStorySections, StorySections } from "@/lib/story-sections";

// Every Home page read comes from here. Nothing in this file calls an upstream
// API — the tables are filled by lib/refresh.ts.

/**
 * How long a render may reuse the previous database read.
 *
 * Measured from inside the deployed function: a query returning one row costs
 * the same ~155ms as one returning 840, so the price is paid per request rather
 * than per row, and page time was almost exactly (number of queries that have to
 * run in sequence) × that cost. Re-reading on every render bought nothing,
 * because the ingestion jobs only write every 15 minutes — a window this far
 * inside that cadence cannot show a visitor figures from a different session
 * than the one already on screen.
 *
 * The reads cached here are all visitor-independent. The watchlist is a cookie
 * and never reaches this file except as an argument, which becomes part of the
 * cache key, so one visitor's selection can never be served to another.
 *
 * WHAT MAKES THIS SAFE IS THAT A FAILED READ THROWS. Every query below goes
 * through lib/db-read.ts, which retries and then raises rather than returning an
 * empty result — because `unstable_cache` writes no entry for a rejected
 * promise. The two are one mechanism: caching is what would otherwise make a
 * single transient failure durable, and throwing is what keeps the empty answer
 * out of the cache. This file previously read `{ data }` alone and could not
 * tell a failure from an empty table; one blip then blanked the sparklines for
 * every visitor for a full minute. Do not reintroduce a read that swallows.
 */
const CACHE_SECONDS = 60;

export type { Ticker };

/**
 * The session the cached data describes: its New York date, and the instant of
 * the newest snapshot in it. Null before any snapshot exists.
 *
 * The shell reads this on every route, which is the reason it is cached and the
 * reason it returns both halves. The day answers "which session is this",
 * asked once per page by a visitor whose own clock is not New York's; the
 * instant answers "how fresh", and it is the one the ET suffix hangs off. It is
 * read from the data rather than from the clock for the same reason
 * getLatestSessionDay is: a wall-clock look-back empties over a weekend.
 *
 * Both fields are strings, so the value survives the data cache — a Date would
 * come back as an ISO string and a Map would come back as {}.
 */
export const getSessionStamp = unstable_cache(
  async (): Promise<{ day: string; at: string } | null> => {
    const newest = await newestSnapshotAt();
    return newest ? { day: tradingDay(new Date(newest)), at: newest } : null;
  },
  ["session-stamp"],
  { revalidate: CACHE_SECONDS },
);

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

const NEWS_COLUMNS =
  "id, headline, source_url, related_symbols, published_at, news_summaries(summary)";

// news_summaries.news_id is the primary key, so PostgREST embeds it as a single
// object rather than an array. Treating it as an array silently yields null.
function toNewsItem(row: Record<string, unknown>): NewsItem {
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

// ---------------------------------------------------------------------------
// Today's Activity
// ---------------------------------------------------------------------------

export type IntradayPoint = { at: string; price: number; volume: number | null };

export type TimelineEntry = {
  at: string;
  kind: "market_open" | "high_volume" | "price_milestone" | "news" | "market_close";
  label: string;
  detail: string | null;
};

export type UpcomingEvent = {
  type: "earnings_date" | "earnings_call";
  at: string;
  note: string | null;
};

export type Story = {
  sections: StorySections;
  generatedAt: string;
};

/**
 * The retired-then-restored AI Daily Summary. Mirrors what `daily-summary.ts`
 * writes to `daily_summaries` (`movement`/`recap`/`explanation` joined into
 * one `summary` string at write time, plus `bullets`) — declared
 * independently rather than imported from there: that file is an
 * upstream/AI job, blocked from page/component imports by
 * `no-restricted-imports`.
 */
export type DailySummary = {
  narrative: string;
  bullets: string[];
  generatedAt: string;
};

export type Activity = {
  /**
   * The session everything on the page describes, as a New York date. Outside
   * market hours this is the last session that produced data, not today — the
   * page would otherwise go blank every evening and all weekend.
   */
  sessionDay: string;
  defaultDay: string;
  isHistorical: boolean;
  availableDates: string[];
  ticker: Ticker;
  /** XLK and SPY, for the Sector and Market stat cards. Null before a refresh. */
  sector: Ticker | null;
  market: Ticker | null;
  intraday: IntradayPoint[];
  news: NewsItem[];
  timeline: TimelineEntry[];
  events: UpcomingEvent[];
  /** The Today's Story narrative, written once by the Groq end-of-day job. */
  story: Story | null;
  /**
   * The AI Daily Summary — a separate card from Today's Story, restored at
   * the owner's request (see CLAUDE.md). Written once per stock by the
   * Gemini end-of-day job (`daily-summary.ts`), which never stopped running
   * after Today's Story shipped — only the reader was removed. This wires a
   * reader back onto its output; the two cards render side by side.
   */
  dailySummary: DailySummary | null;
  /** This stock's change% against the average of its PEERS tickers. */
  peers: PeerComparison & { symbols: string[] };
  periodPerformance: PeriodPerformance;
  /**
   * The same rows periodPerformance was computed from, up to 370 days,
   * oldest first — kept on the payload for the story charts (52-week range,
   * YTD trend) rather than discarded once periodPerformance is derived.
   */
  dailyCloses: { tradingDay: string; close: number }[];
};

const SECTOR_SYMBOL = "XLK";
const MARKET_SYMBOL = "SPY";

/** One symbol's daily_closes history, bounded by the table's 370-day retention. */
async function getDailyCloses(
  symbol: string,
  day: string,
): Promise<{ tradingDay: string; close: number }[]> {
  const rows = await readDailyCloses(`daily-closes:${symbol}`, [symbol], day);
  return rows.map((row) => ({ tradingDay: row.tradingDay, close: row.close }));
}

/**
 * Every INDEX_SYMBOLS proxy's own daily_closes history in one query — the
 * Market page's counterpart to getDailyCloses above, batched across the 6
 * index/sub-sector symbols the same way market-story-generation.ts's
 * loadIndexDailyCloses already batches it for the Groq job. Feeds Market
 * Story's charts (VIXY's trailing range, XLK's YTD line) with the same rows
 * buildMarketStoryInput uses to compute volatilityPercentile/rangePosition —
 * kept on the payload raw, same "don't discard what a chart needs" reasoning
 * getActivity already applies to a single stock's dailyCloses.
 */
async function getIndexDailyClosesUncached(
  day: string,
): Promise<{ symbol: string; tradingDay: string; close: number; changePercent: number | null }[]> {
  return readDailyCloses("index-daily-closes", INDEX_SYMBOLS, day);
}

/** One session's intraday price and volume series for a symbol, oldest first. */
async function getIntraday(
  symbol: string,
  day: string,
): Promise<IntradayPoint[]> {
  const { from, to } = dayWindow(day);
  // One symbol's day is ~27 rows, so the ceiling is nowhere near — but no cap is
  // stated, which is exactly the case the count is cheap insurance for.
  const rows = await readRows<{
    price: number;
    volume: number | null;
    snapshot_at: string;
  }>(`intraday:${symbol}`, (signal) =>
    db
      .from("intraday_snapshots")
      .select("price, volume, snapshot_at", { count: "exact" })
      .eq("symbol", symbol)
      .gte("snapshot_at", from)
      .lt("snapshot_at", to)
      .order("snapshot_at", { ascending: true })
      .limit(1000)
      .abortSignal(signal).retry(false),
  );

  return rows
    .filter((row) => tradingDay(new Date(row.snapshot_at)) === day)
    .map((row) => ({
      at: row.snapshot_at,
      price: Number(row.price),
      volume: row.volume == null ? null : Number(row.volume),
    }));
}

/**
 * News Finnhub tagged with this symbol during one session.
 *
 * Scoped to the session on purpose: the stat card counts these as the day's
 * articles, and an unscoped "most recent 8 ever" made that card claim a number
 * the narrative directly beneath it contradicted. No limit, so the count is the
 * real one — a single symbol's day is a handful of articles.
 */
async function getSymbolNews(symbol: string, day: string): Promise<NewsItem[]> {
  const { from, to } = dayWindow(day);
  const rows = await readRows<Record<string, unknown>>(
    `symbol-news:${symbol}`,
    (signal) =>
      db
        .from("news")
        .select(NEWS_COLUMNS, { count: "exact" })
        .contains("related_symbols", [symbol])
        .gte("published_at", from)
        .lt("published_at", to)
        .order("published_at", { ascending: false })
        .limit(1000)
        .abortSignal(signal).retry(false),
  );

  return rows
    .filter((row) => tradingDay(new Date(row.published_at as string)) === day)
    .map((row) => toNewsItem(row));
}

export type MarketStory = { sections: MarketStorySections; generatedAt: string };

async function getMarketStoryUncached(day: string): Promise<MarketStory | null> {
  const row = await readMaybeOne<{ sections: MarketStorySections; generated_at: string }>(
    `market-story:${day}`,
    (signal) =>
      db
        .from("market_stories")
        .select("sections, generated_at")
        .eq("story_date", day)
        .abortSignal(signal).retry(false)
        .maybeSingle(),
  );
  return row ? { sections: row.sections, generatedAt: row.generated_at as string } : null;
}

/** One resolved Market Session, with the narrative and charts for that same day. */
export const getMarketSession = unstable_cache(
  async (requestedDate?: string) => {
    const session = await readPageSession([...INDEX_SYMBOLS, ...TRACKED_STOCK_SYMBOLS], requestedDate);
    const [story, indexDailyCloses] = await Promise.all([
      getMarketStoryUncached(session.day),
      getIndexDailyClosesUncached(session.day),
    ]);
    const bySymbol = new Map(session.tickers.map((ticker) => [ticker.symbol, ticker]));
    const indices = INDEX_SYMBOLS.flatMap((symbol) => {
      const ticker = bySymbol.get(symbol);
      return ticker ? [ticker] : [];
    });
    const trackedStocks = TRACKED_STOCK_SYMBOLS.flatMap((symbol) => {
      const ticker = bySymbol.get(symbol);
      return ticker ? [ticker] : [];
    });
    return {
      day: session.day, defaultDay: session.defaultDay, hasSession: session.hasSession,
      isHistorical: session.isHistorical, availableDates: session.availableDates,
      indices, trackedStocks, story, indexDailyCloses,
      topMovers: computeTopMovers(trackedStocks),
      sectorAverages: computeSectorAverages(trackedStocks),
    };
  },
  ["market-session"],
  { revalidate: CACHE_SECONDS },
);

/**
 * Everything the Today's Activity page renders for one stock. Every field is a
 * cached table read — the page makes no upstream call and triggers no AI call;
 * the narrative was written once by the end-of-day job.
 *
 * `day` picks one of the previous 6 trading days instead of the live session.
 * Missing or invalid dates use the latest stored Session for this symbol.
 */
async function getActivityUncached(symbol: string, day?: string): Promise<Activity | null> {
  const peerSymbols = PEERS[symbol] ?? [];
  const session = await readPageSession([symbol, SECTOR_SYMBOL, MARKET_SYMBOL, ...peerSymbols], day, symbol);
  const sessionDay = session.day;

  // One wave, not two: the timeline/events/summary queries only need `symbol`
  // and `sessionDay`, both already known, so they don't have to wait behind the
  // tickers/intraday/news queries above them.
  const [intraday, news, timelineRows, eventRows, storyRow, summaryRow, dailyCloses] =
    await Promise.all([
      getIntraday(symbol, sessionDay),
      getSymbolNews(symbol, sessionDay),
      readRows<{ event_at: string; kind: string; label: string; detail: string | null }>(
        `timeline:${symbol}`,
        (signal) =>
          db
            .from("timeline_events")
            .select("event_at, kind, label, detail")
            .eq("symbol", symbol)
            .eq("trading_day", sessionDay)
            .order("event_at", { ascending: true })
            .abortSignal(signal).retry(false),
      ),
      // Bounded by the start of today's ET date, not by the current instant.
      // Earnings rows carry a time only so the date and the call sort in order
      // (noon and 21:00 UTC), so comparing against "now" hid today's earnings from
      // the afternoon onwards — on the one day they matter most.
      readRows<{ event_type: string; event_at: string; note: string | null }>(
        `events:${symbol}`,
        (signal) =>
          db
            .from("events")
            .select("event_type, event_at, note")
            .eq("symbol", symbol)
            .gte("event_at", `${tradingDay()}T00:00:00Z`)
            .order("event_at", { ascending: true })
            .abortSignal(signal).retry(false),
      ),
      // Absent is a normal answer here — a stock the post-close job has not
      // reached yet has no row — so this is the one read whose empty result is
      // meaningful rather than suspicious.
      readMaybeOne<{ sections: StorySections; generated_at: string }>(
        `story:${symbol}`,
        (signal) =>
          db
            .from("stories")
            .select("sections, generated_at")
            .eq("symbol", symbol)
            .eq("story_date", sessionDay)
            .abortSignal(signal).retry(false)
            .maybeSingle(),
      ),
      // Absent is a normal answer here too — the same "job hasn't reached it
      // yet" case the story read above documents.
      readMaybeOne<{ summary: string; bullets: string[] | null; generated_at: string }>(
        `daily-summary:${symbol}`,
        (signal) =>
          db
            .from("daily_summaries")
            .select("summary, bullets, generated_at")
            .eq("symbol", symbol)
            .eq("summary_date", sessionDay)
            .abortSignal(signal).retry(false)
            .maybeSingle(),
      ),
      getDailyCloses(symbol, sessionDay),
    ]);

  const bySymbol = new Map(session.tickers.map((t) => [t.symbol, t]));
  const ticker = bySymbol.get(symbol);
  // Narrower than it used to be, and the narrowing matters. This once absorbed
  // a failed read as well, and the route turns null into notFound() — so a
  // transient Supabase error rendered a 404 for a stock that plainly exists. A
  // read failure now throws before reaching here, and the route checks the
  // symbol against ALL_SYMBOLS itself, so the only case left is the honest one:
  // a tracked symbol with no price_cache row yet, before the first refresh.
  if (!ticker) return null;

  // A peer missing from price_cache (not yet refreshed) is simply absent here
  // rather than treated as a zero move.
  const peerChangePercents = peerSymbols.flatMap((peerSymbol) => {
    const peerTicker = bySymbol.get(peerSymbol);
    return peerTicker ? [peerTicker.changePercent] : [];
  });

  return {
    sessionDay,
    defaultDay: session.defaultDay,
    isHistorical: session.isHistorical,
    availableDates: session.availableDates,
    ticker,
    sector: bySymbol.get(SECTOR_SYMBOL) ?? null,
    market: bySymbol.get(MARKET_SYMBOL) ?? null,
    intraday,
    news,
    peers: { ...computePeerComparison(ticker.changePercent, peerChangePercents), symbols: peerSymbols },
    periodPerformance: computePeriodPerformance(dailyCloses, sessionDay, ticker.price),
    dailyCloses,
    timeline: timelineRows.map((row) => ({
      at: row.event_at,
      kind: row.kind as TimelineEntry["kind"],
      label: row.label,
      detail: row.detail ?? null,
    })),
    events: eventRows.map((row) => ({
      type: row.event_type as UpcomingEvent["type"],
      at: row.event_at,
      note: row.note ?? null,
    })),
    story: storyRow
      ? { sections: storyRow.sections, generatedAt: storyRow.generated_at as string }
      : null,
    dailySummary: summaryRow
      ? {
          narrative: summaryRow.summary,
          bullets: summaryRow.bullets ?? [],
          generatedAt: summaryRow.generated_at as string,
        }
      : null,
  };
}

// Keyed by symbol and requested date; metadata and body share a render lookup. Every field
// in Activity is a string, a number or an array of them, so the object survives
// the cache unchanged; no timestamp here is a Date that would come back as text.
export const getActivity = cache(unstable_cache(getActivityUncached, ["activity"], {
  revalidate: CACHE_SECONDS,
}));
