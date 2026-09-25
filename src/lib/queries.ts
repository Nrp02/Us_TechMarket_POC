import { unstable_cache } from "next/cache";

import { readMaybeOne, readRows } from "@/lib/db-read";
import { dayWindow, tradingDay } from "@/lib/market";
import type { NewsCategory } from "@/lib/news-category";
import { newsRetentionCutoff } from "@/lib/news-retention";
import { computePeerComparison, type PeerComparison } from "@/lib/peer-comparison";
import { computePeriodPerformance, type PeriodPerformance } from "@/lib/period-performance";
import { isSignificant, relativeVolume, significanceScore } from "@/lib/significance";
import { db } from "@/lib/supabase";
import { NAME_BY_SYMBOL, PEERS } from "@/lib/symbols";

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

export type Ticker = {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number | null;
  /** Volume so far today over the 10-day average; null when volume is unknown. */
  relativeVolume: number | null;
  significant: boolean;
  score: number;
  /** Today's intraday closes, oldest first. Empty until a refresh has run. */
  spark: number[];
};

type PriceRow = {
  symbol: string;
  price: number;
  change: number;
  change_percent: number;
  volume: number | null;
  avg_volume: number | null;
};

/** The instant of the newest stored snapshot, overall or for one symbol. */
async function newestSnapshotAt(symbol?: string): Promise<string | null> {
  // No `count: "exact"`: `.limit(1)` is a natural bound, so there is no cap to
  // hit and no reason to pay for a count.
  const rows = await readRows<{ snapshot_at: string }>(
    symbol ? `newest-snapshot:${symbol}` : "newest-snapshot",
    (signal) => {
      let query = db
        .from("intraday_snapshots")
        .select("snapshot_at")
        .order("snapshot_at", { ascending: false })
        .limit(1);

      if (symbol) query = query.eq("symbol", symbol);

      return query.abortSignal(signal);
    },
  );

  return rows[0]?.snapshot_at ?? null;
}

/**
 * The most recent session that actually produced snapshots, as an ET date.
 *
 * Everything on a per-stock page keys off this. It is read from the data rather
 * than assumed from the clock: a fixed look-back window expires at a wall-clock
 * moment, which silently emptied the page from Sunday afternoon until Monday's
 * open — and after every market holiday — because the chart, the timeline and
 * the stored summary are all looked up by the day the snapshots imply.
 */
async function getLatestSessionDay(symbol?: string): Promise<string | null> {
  const newest = await newestSnapshotAt(symbol);
  return newest ? tradingDay(new Date(newest)) : null;
}

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

/** Latest session's intraday closes per symbol, keyed by symbol. */
async function getSparklines(): Promise<Map<string, number[]>> {
  const day = await getLatestSessionDay();
  if (!day) return new Map();

  const { from, to } = dayWindow(day);

  // The one read in this file with no natural bound: it carries every tracked
  // symbol's whole session in a single response. 25 symbols × 27 points = 675
  // rows today, against a PostgREST ceiling of 1000 that truncates silently. The
  // explicit limit does not raise that ceiling — it makes it visible in the
  // source rather than an invisible server setting — and the exact count is what
  // lets db-read tell a short reply from a complete one. It becomes a real
  // problem at 38 tracked symbols, and the ordering is ascending, so truncation
  // would drop the newest point of every sparkline at once.
  const rows = await readRows<{ symbol: string; price: number; snapshot_at: string }>(
    "sparklines",
    (signal) =>
      db
        .from("intraday_snapshots")
        .select("symbol, price, snapshot_at", { count: "exact" })
        .gte("snapshot_at", from)
        .lt("snapshot_at", to)
        .order("snapshot_at", { ascending: true })
        .limit(1000)
        .abortSignal(signal),
  );

  // The window can only straddle the boundary, never span two sessions, so the
  // trading-day comparison is what actually pins each point to `day`.
  const result = new Map<string, number[]>();
  for (const row of rows) {
    if (tradingDay(new Date(row.snapshot_at)) !== day) continue;
    result.set(row.symbol, [...(result.get(row.symbol) ?? []), Number(row.price)]);
  }
  return result;
}

async function getTickersUncached(
  symbols: string[],
  // Sparklines cost a read of every tracked symbol's whole session, so a caller
  // that does not render one says so rather than paying for it.
  { sparklines = true }: { sparklines?: boolean } = {},
): Promise<Ticker[]> {
  if (!symbols.length) return [];

  const [prices, sparks] = await Promise.all([
    // `.in()` over at most 25 symbols is its own bound, so no exact count.
    readRows<PriceRow>("price-cache", (signal) =>
      db
        .from("price_cache")
        .select("symbol, price, change, change_percent, volume, avg_volume")
        .in("symbol", symbols)
        .abortSignal(signal),
    ),
    sparklines ? getSparklines() : new Map<string, number[]>(),
  ]);

  const bySymbol = new Map(prices.map((row) => [row.symbol, row]));

  // A read failure can no longer reach this point — it throws upstream — so an
  // absent row now means what it says: the symbol has never been refreshed. That
  // was worth nothing while the two were indistinguishable, and is the line that
  // confirms it next time.
  const missing = symbols.filter((symbol) => !bySymbol.has(symbol));
  if (missing.length) {
    console.warn(`[read] price-cache has no row for ${missing.join(", ")}`);
  }

  return symbols.flatMap((symbol) => {
    const row = bySymbol.get(symbol);
    if (!row) return [];

    const changePercent = Number(row.change_percent);
    const relVolume = relativeVolume(row.volume, row.avg_volume);

    return [
      {
        symbol,
        name: NAME_BY_SYMBOL.get(symbol) ?? symbol,
        price: Number(row.price),
        change: Number(row.change),
        changePercent,
        volume: row.volume ? Number(row.volume) : null,
        relativeVolume: relVolume,
        significant: isSignificant(changePercent, relVolume),
        score: significanceScore(changePercent, relVolume),
        spark: sparks.get(symbol) ?? [],
      },
    ];
  });
}

// Ticker[] is plain JSON, so it survives the cache intact. The Map that
// getSparklines returns deliberately never crosses this boundary — a Map
// serialises to {} and every sparkline would silently come back empty.
export const getTickers = unstable_cache(getTickersUncached, ["tickers"], {
  revalidate: CACHE_SECONDS,
});

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
        .abortSignal(signal),
  );

  const newest = rows[0]?.published_at;
  return newest ? tradingDay(new Date(newest)) : null;
}

const getNewestNewsDay = unstable_cache(
  getNewestNewsDayUncached,
  ["news-newest-day"],
  { revalidate: CACHE_SECONDS },
);

async function getNewsUncached(
  watchlist: string[],
  category?: NewsCategory,
  day?: string | null,
  limit = 60,
): Promise<NewsItem[]> {
  // `count: "exact"` is asked for only on the day path, and the asymmetry is
  // load-bearing: PostgREST reports the total matching rows, ignoring `limit`.
  // On the teaser path `limit` is an intentional cap far below the ceiling, so a
  // count would always exceed what came back and db-read would read every
  // healthy read as truncated. On the day path the only cap is the ceiling
  // itself, which is precisely what the count is there to catch.
  const buildQuery = (signal: AbortSignal) => {
    let query = db
      .from("news")
      .select(NEWS_COLUMNS, day ? { count: "exact" } : undefined)
      .order("published_at", { ascending: false });

    // `limit` is applied in Postgres only when there is no day filter, and that
    // placement is the whole point rather than an optimisation.
    //
    // dayWindow is 36 hours wide because it has to *contain* an ET day (see
    // below); the exact day is settled afterwards in JS. Applying the limit in
    // Postgres therefore truncated the wrong set — it took the newest `limit`
    // rows of the 36-hour window, which are dominated by the *next* ET day, and
    // the JS filter then threw most of them away. Measured on ET 2026-08-20: the
    // window held 183 rows, the day itself held 122, and the page rendered 5.
    //
    // It was worse than a simple undercount, because the category predicates run
    // in Postgres too. Each tab drew its 60 from a smaller pool, so more of its
    // rows survived the day filter than All News's did — 34 / 38 / 27 against 5,
    // three tabs each larger than the tab that is supposed to contain them.
    //
    // So a day view is uncapped: the window bounds it to a few hundred rows, and
    // a query returning 200 rows costs what one returning 1 costs here (the cost
    // is per request — see CACHE_SECONDS). The `limit` argument is ignored on
    // this path, which no caller exercises: only the Home teaser passes one, and
    // it passes no day.
    //
    // PostgREST's own 1000-row ceiling is *not* a graceful backstop here, which
    // is worth stating because it reads like one. It keeps the newest 1000 rows
    // and drops the rest, and the newest rows of a 36-hour window are the next ET
    // day — so a window that ever exceeded 1000 would lose the requested day from
    // its oldest end and reproduce exactly the bug above, tabs outgrowing All News
    // and all. Headroom is real (183 rows in the widest window measured). It is
    // no longer trusted silently: the day path states the ceiling as an explicit
    // limit and asks for the exact count, so exceeding it raises instead of
    // quietly serving the wrong day. Tightening the window is still the fix if
    // that ever fires.
    //
    // Headroom is smaller than it was. The widest window measured 183 rows when
    // that was written; ET day 2026-09-04 alone now holds 253 articles, so the
    // 36-hour window around a busy day runs ~350-400. This is the same growth
    // that broke news-dates (see below, and migration 0009) — the day path is
    // the next read that would fire, at roughly 2.5x today's volume.
    query = day ? query.limit(1000) : query.limit(limit);

    // An empty tag list is what identifies the general feed; everything else is a
    // company article, sorted by whether the visitor watches any of its tickers.
    if (category === "market") query = query.eq("related_symbols", "{}");
    if (category === "company") query = query.overlaps("related_symbols", watchlist);
    if (category === "industry") {
      query = query
        .neq("related_symbols", "{}")
        .not("related_symbols", "ov", `{${watchlist.join(",")}}`);
    }

    if (day) {
      const { from, to } = dayWindow(day);
      query = query.gte("published_at", from).lt("published_at", to);
    }

    return query.abortSignal(signal);
  };

  // The retention floor is applied here rather than as a SQL bound, because it
  // depends on the newest stored day and so is not known while the query is
  // being built. Nothing is lost: the rows are already ordered newest first, so
  // the limit still takes the newest `limit` articles and the floor only ever
  // trims a tail that failed it. That reasoning only holds because the limit
  // and the floor agree on an ordering; it is exactly the reasoning the day
  // filter broke, since a day is not a suffix of a newest-first list.
  const [rows, newestDay] = await Promise.all([
    readRows<Record<string, unknown>>("news", buildQuery),
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

// The watchlist is an argument rather than a cookie read, so it lands in the
// cache key and the Company and Industry tabs stay per-visitor.
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
export async function getNewsTeaser(
  watchlist: string[],
  limit = 3,
): Promise<NewsItem[]> {
  return getNews(watchlist, undefined, null, limit);
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
      .abortSignal(signal),
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

/**
 * The 8-section Today's Story narrative, read back from the `stories` table.
 * Mirrors the shape `story-generation.ts` writes (its `StorySections`), but is
 * declared independently rather than imported from there — that file is an
 * upstream/AI job (blocked from page/component imports by `no-restricted-imports`
 * in eslint.config.mjs), and this read-side type is this file's own, same as
 * the retired `DailySummary` type was never imported from `daily-summary.ts`.
 */
export type StorySections = {
  headline: {
    text: string;
    news: { headline: string; sourceUrl: string; publishedAt: string } | null;
  };
  comparison: string;
  classification: string;
  unusualness: string;
  explanation: string;
  fundamentals: string;
  peerSectorRelation: string;
  ytdTakeaway: string;
};

export type Story = {
  sections: StorySections;
  generatedAt: string;
};

export type Activity = {
  /**
   * The session everything on the page describes, as a New York date. Outside
   * market hours this is the last session that produced data, not today — the
   * page would otherwise go blank every evening and all weekend.
   */
  sessionDay: string;
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

/**
 * One symbol's daily_closes history, oldest bound by the table's own 370-day
 * retention rather than a limit here — 370 rows is nowhere near PostgREST's
 * 1000-row ceiling, so no exact count is asked for (see db-read.ts's rule on
 * when a count is worth paying for).
 */
async function getDailyCloses(
  symbol: string,
  day: string,
): Promise<{ tradingDay: string; close: number }[]> {
  const rows = await readRows<{ trading_day: string; close: number }>(
    `daily-closes:${symbol}`,
    (signal) =>
      db
        .from("daily_closes")
        .select("trading_day, close")
        .eq("symbol", symbol)
        .lte("trading_day", day)
        .abortSignal(signal),
  );
  return rows.map((row) => ({ tradingDay: row.trading_day, close: Number(row.close) }));
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
      .abortSignal(signal),
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
        .abortSignal(signal),
  );

  return rows
    .filter((row) => tradingDay(new Date(row.published_at as string)) === day)
    .map((row) => toNewsItem(row));
}

/**
 * Everything the Today's Activity page renders for one stock. Every field is a
 * cached table read — the page makes no upstream call and triggers no AI call;
 * the narrative was written once by the end-of-day job.
 */
async function getActivityUncached(symbol: string): Promise<Activity | null> {
  // The snapshots decide which session the page shows, and everything below is
  // then read for that one day — chart, news count, timeline and narrative all
  // describing the same session rather than each picking its own.
  const sessionDay = (await getLatestSessionDay(symbol)) ?? tradingDay();

  const peerSymbols = PEERS[symbol] ?? [];

  // One wave, not two: the timeline/events/summary queries only need `symbol`
  // and `sessionDay`, both already known, so they don't have to wait behind the
  // tickers/intraday/news queries above them.
  const [tickers, intraday, news, timelineRows, eventRows, storyRow, dailyCloses] =
    await Promise.all([
      // This page draws its own chart from getIntraday and renders no sparkline.
      // Uncached on purpose: the whole of getActivity is cached below, so going
      // through the cached variant here would only add a second lookup for a
      // result this one already covers. Peers ride the same query — their
      // prices are already in price_cache, so this is a wider `IN (...)` on a
      // table already being read, not a new upstream call.
      getTickersUncached([symbol, SECTOR_SYMBOL, MARKET_SYMBOL, ...peerSymbols], {
        sparklines: false,
      }),
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
            .abortSignal(signal),
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
            .abortSignal(signal),
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
            .abortSignal(signal)
            .maybeSingle(),
      ),
      getDailyCloses(symbol, sessionDay),
    ]);

  const bySymbol = new Map(tickers.map((t) => [t.symbol, t]));
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
    ticker,
    sector: bySymbol.get(SECTOR_SYMBOL) ?? null,
    market: bySymbol.get(MARKET_SYMBOL) ?? null,
    intraday,
    news,
    peers: { ...computePeerComparison(ticker.changePercent, peerChangePercents), symbols: peerSymbols },
    periodPerformance: computePeriodPerformance(dailyCloses, sessionDay),
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
  };
}

// Keyed by symbol alone — nothing on this page varies by visitor. Every field
// in Activity is a string, a number or an array of them, so the object survives
// the cache unchanged; no timestamp here is a Date that would come back as text.
export const getActivity = unstable_cache(getActivityUncached, ["activity"], {
  revalidate: CACHE_SECONDS,
});
