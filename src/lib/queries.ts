import { unstable_cache } from "next/cache";
import { cache } from "react";

import { readDailyCloses } from "@/lib/daily-closes";
import { readMaybeOne, readRows } from "@/lib/db-read";
import { dayWindow, tradingDay } from "@/lib/market";
import { computeSectorAverages, computeTopMovers } from "@/lib/market-breadth";
import { computePeerComparison, type PeerComparison } from "@/lib/peer-comparison";
import { computePeriodPerformance, type PeriodPerformance } from "@/lib/period-performance";
import {
  newestSnapshotAt,
  readPageDay,
  readPageTickers,
  type Ticker,
} from "@/lib/session";
import { CACHE_SECONDS } from "@/lib/cache-policy";
import { NEWS_COLUMNS, toNewsItem, type NewsItem } from "@/lib/queries-news";
import { db } from "@/lib/supabase";
import { INDEX_SYMBOLS, PEERS, TRACKED_STOCK_SYMBOLS } from "@/lib/symbols";
import type { MarketStorySections, StorySections } from "@/lib/story-sections";

// Every Home page read comes from here. Nothing in this file calls an upstream
// API — the tables are filled by lib/refresh.ts.


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
    const session = await readPageDay(requestedDate);
    const [tickers, story, indexDailyCloses] = await Promise.all([
      readPageTickers([...INDEX_SYMBOLS, ...TRACKED_STOCK_SYMBOLS], session),
      getMarketStoryUncached(session.day),
      getIndexDailyClosesUncached(session.day),
    ]);
    const bySymbol = new Map(tickers.map((ticker) => [ticker.symbol, ticker]));
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
  const session = await readPageDay(day, symbol);
  const sessionDay = session.day;

  // One wave, not two: everything here needs only `symbol` and `sessionDay`,
  // both already known, so nothing waits behind the tickers.
  const [tickers, intraday, news, timelineRows, eventRows, storyRow, summaryRow, dailyCloses] =
    await Promise.all([
      readPageTickers([symbol, SECTOR_SYMBOL, MARKET_SYMBOL, ...peerSymbols], session, symbol),
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
