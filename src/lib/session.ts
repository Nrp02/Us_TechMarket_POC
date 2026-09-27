// Which session the stored data describes, and each symbol's figures for it.
//
// Every reader of "the day" goes through here — the pages (via the cached
// wrappers in queries.ts) and the AI jobs (directly, since a job must not read
// a 60-second-old cache). Before this module existed the jobs each rebuilt
// Tickers by hand from price_cache, decided "is this the live session?" from
// the clock in one place and from the data in another, and gated freshness on
// the calendar date a row was written — which a forced weekend refresh defeats.

import { readAllRows, readRows } from "@/lib/db-read";
import { buildDayTicker } from "@/lib/day-ticker";
import { dayWindow, sessionDayTimes, tradingDay } from "@/lib/market";
import { isSignificant, relativeVolume, significanceScore } from "@/lib/significance";
import { db } from "@/lib/supabase";
import { NAME_BY_SYMBOL } from "@/lib/symbols";

export type Ticker = {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number | null;
  /** Volume so far today over the 10-day average; null when volume is unknown. */
  relativeVolume: number | null;
  /** The 10-day average volume the ratio above is taken against. */
  avgVolume: number | null;
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
  updated_at: string;
};

/** The instant of the newest stored snapshot, overall or for one symbol. */
export async function newestSnapshotAt(symbol?: string): Promise<string | null> {
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
export async function latestSessionDay(symbol?: string): Promise<string | null> {
  const newest = await newestSnapshotAt(symbol);
  return newest ? tradingDay(new Date(newest)) : null;
}

/** Latest session's intraday closes per symbol, keyed by symbol. */
async function getSparklines(): Promise<Map<string, number[]>> {
  const day = await latestSessionDay();
  if (!day) return new Map();

  const { from, to } = dayWindow(day);

  // 49 symbols × 27 bars exceed 1000 rows: read the entire ordered session.
  const rows = await readAllRows<{ symbol: string; price: number; snapshot_at: string }>(
    "sparklines",
    (signal, start, end) =>
      db
        .from("intraday_snapshots")
        .select("symbol, price, snapshot_at", { count: "exact" })
        .gte("snapshot_at", from)
        .lt("snapshot_at", to)
        .order("snapshot_at", { ascending: true })
        .order("symbol", { ascending: true })
        .range(start, end)
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

/** The live cache as Tickers: whatever price_cache holds right now, freshness unchecked. */
export async function readLiveTickers(
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
        .select("symbol, price, change, change_percent, volume, avg_volume, updated_at")
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
    return row ? [toTicker(row, sparks.get(symbol) ?? [])] : [];
  });
}

function toTicker(row: PriceRow, spark: number[]): Ticker {
  const changePercent = Number(row.change_percent);
  const avgVolume = row.avg_volume == null ? null : Number(row.avg_volume);
  const relVolume = relativeVolume(row.volume, avgVolume);
  return {
    symbol: row.symbol,
    name: NAME_BY_SYMBOL.get(row.symbol) ?? row.symbol,
    price: Number(row.price),
    change: Number(row.change),
    changePercent,
    volume: row.volume ? Number(row.volume) : null,
    relativeVolume: relVolume,
    avgVolume,
    significant: isSignificant(changePercent, relVolume),
    score: significanceScore(changePercent, relVolume),
    spark,
  };
}

/**
 * The historical counterpart to readLiveTickers: builds the same Ticker
 * shape for any of the previous 6 trading days, from daily_closes
 * (price/change/change%, the real source now that it stores them directly —
 * see migration 0010) and that day's intraday_snapshots (volume, summed per
 * symbol — see day-ticker.ts for why a sum, not the last bar). Never used for
 * "today" — the live path keeps reading price_cache exactly as before.
 */
export async function readDayTickers(symbols: string[], day: string): Promise<Ticker[]> {
  if (!symbols.length) return [];
  const { from, to } = dayWindow(day);

  const [closeRows, snapshotRows] = await Promise.all([
    readRows<{ symbol: string; close: number; change: number; change_percent: number; volume: number | null; avg_volume: number | null }>(
      "day-ticker-closes",
      (signal) =>
        db
          .from("daily_closes")
          .select("symbol, close, change, change_percent, volume, avg_volume")
          .in("symbol", symbols)
          .eq("trading_day", day)
          .abortSignal(signal),
    ),
    readAllRows<{ symbol: string; price: number; volume: number | null; snapshot_at: string }>(
      "day-ticker-snapshots",
      (signal, start, end) =>
        db
          .from("intraday_snapshots")
          .select("symbol, price, volume, snapshot_at", { count: "exact" })
          .in("symbol", symbols)
          .gte("snapshot_at", from)
          .lt("snapshot_at", to)
          .order("snapshot_at", { ascending: true })
          .order("symbol", { ascending: true })
          .range(start, end)
          .abortSignal(signal),
    ),
  ]);

  const closeBySymbol = new Map(
    closeRows.map((row) => [
      row.symbol,
      {
        close: Number(row.close),
        change: Number(row.change),
        changePercent: Number(row.change_percent),
        volume: row.volume == null ? null : Number(row.volume),
        avgVolume: row.avg_volume == null ? null : Number(row.avg_volume),
      },
    ]),
  );

  const bySymbol = new Map<string, { volumes: number[]; prices: number[] }>(
    symbols.map((symbol) => [symbol, { volumes: [], prices: [] }]),
  );
  for (const row of snapshotRows) {
    if (tradingDay(new Date(row.snapshot_at)) !== day) continue;
    const bucket = bySymbol.get(row.symbol);
    if (!bucket) continue;
    if (row.volume != null) bucket.volumes.push(Number(row.volume));
    bucket.prices.push(Number(row.price));
  }

  return symbols.flatMap((symbol) => {
    const bucket = bySymbol.get(symbol)!;
    const ticker = buildDayTicker({
      symbol,
      name: NAME_BY_SYMBOL.get(symbol) ?? symbol,
      dailyClose: closeBySymbol.get(symbol) ?? null,
      snapshotVolumes: bucket.volumes,
      sparkPrices: bucket.prices,
    });
    return ticker ? [ticker] : [];
  });
}

/**
 * `day`'s figures for `symbols`, and whether `day` is the live session — the
 * newest one the snapshots record, decided from the data, never the clock.
 *
 * Live: price_cache, keeping only rows refreshed since `day`'s session opened.
 * `day` is the newest session on record, so any such refresh describes it; a
 * symbol whose refresh failed all session is `stale` rather than quietly
 * carrying the previous session's quote. This holds for a refresh forced on a
 * weekend too, where the old "written on `day`'s date" rule marked every
 * symbol stale.
 *
 * Historical: daily_closes plus that day's snapshots (readDayTickers); a
 * symbol with no stored close for `day` is `stale`.
 */
export async function readSessionTickers(
  symbols: string[],
  day?: string,
): Promise<{ day: string; isLive: boolean; tickers: Map<string, Ticker>; stale: string[] }> {
  const latest = (await latestSessionDay()) ?? tradingDay();
  const sessionDay = day ?? latest;
  const isLive = sessionDay === latest;

  let tickers: Ticker[];
  if (isLive) {
    const opened = Date.parse(sessionDayTimes(sessionDay).start);
    const rows = await readRows<PriceRow>(`session-prices:${sessionDay}`, (signal) =>
      db
        .from("price_cache")
        .select("symbol, price, change, change_percent, volume, avg_volume, updated_at")
        .in("symbol", symbols)
        .abortSignal(signal),
    );
    tickers = rows.filter((row) => Date.parse(row.updated_at) >= opened).map((row) => toTicker(row, []));
  } else {
    tickers = await readDayTickers(symbols, sessionDay);
  }

  const bySymbol = new Map(tickers.map((t) => [t.symbol, t]));
  return { day: sessionDay, isLive, tickers: bySymbol, stale: symbols.filter((s) => !bySymbol.has(s)) };
}
