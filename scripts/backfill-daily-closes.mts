// One-time backfill of supabase/migrations/0010_daily_closes.sql's
// daily_closes table for all 25 tracked symbols (ALL_SYMBOLS), from Yahoo's
// unauthenticated chart endpoint — the same one src/lib/yahoo.ts already
// calls, at a wider range/interval (1 year of daily bars instead of 1 day of
// 15-minute bars).
//
// Run with: npm run backfill-daily-closes
//
// A one-off, human-triggered script exactly like setup-cron.mts: it calls
// Yahoo directly rather than through the app, so the "no client-triggered
// upstream API calls" rule (which protects the *deployed app's* traffic
// surface) doesn't apply to it, and it never touches /api/refresh's
// CRON_SECRET gate.
import { db } from "../src/lib/supabase.ts";
import { ALL_SYMBOLS } from "../src/lib/symbols.ts";

const CHART = "https://query1.finance.yahoo.com/v8/finance/chart";
/** Same polite concurrency refresh.ts already uses against this endpoint family. */
const CONCURRENCY = 5;

type ChartResponse = {
  chart: {
    result?: [
      {
        timestamp?: number[];
        indicators: { quote: [{ close?: (number | null)[] }] };
      },
    ];
  };
};

type Bar = { day: string; close: number };

async function fetchYearOfCloses(symbol: string): Promise<Bar[]> {
  const res = await fetch(
    `${CHART}/${encodeURIComponent(symbol)}?range=1y&interval=1d`,
    { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(10_000) },
  );
  if (!res.ok) throw new Error(`Yahoo ${symbol} -> ${res.status}`);

  const result = ((await res.json()) as ChartResponse).chart.result?.[0];
  if (!result) return [];

  const stamps = result.timestamp ?? [];
  const closes = result.indicators.quote[0].close ?? [];

  const bars: Bar[] = [];
  stamps.forEach((stamp, i) => {
    const close = closes[i];
    if (close == null) return;
    // A daily bar's own UTC date is its trading day — no ET conversion needed,
    // since Yahoo already reports one bar per US trading day for range=1y.
    const day = new Date(stamp * 1000).toISOString().slice(0, 10);
    bars.push({ day, close });
  });
  return bars;
}

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}

type Row = {
  symbol: string;
  trading_day: string;
  close: number;
  change: number | null;
  change_percent: number | null;
};

const perSymbol = await mapLimit(ALL_SYMBOLS, CONCURRENCY, async (symbol) => {
  const bars = await fetchYearOfCloses(symbol);
  const rows: Row[] = bars.map((bar, i) => {
    const prev = bars[i - 1];
    const change = prev ? bar.close - prev.close : null;
    return {
      symbol,
      trading_day: bar.day,
      close: bar.close,
      change,
      change_percent: prev && change != null ? (change / prev.close) * 100 : null,
    };
  });
  console.log(`${symbol}: ${rows.length} daily closes`);
  return rows;
});

const rows = perSymbol.flat();
if (!rows.length) {
  console.error("No rows fetched — aborting without writing anything.");
  process.exit(1);
}

const { error } = await db
  .from("daily_closes")
  .upsert(rows, { onConflict: "symbol,trading_day" });
if (error) throw new Error(`daily_closes upsert: ${error.message}`);

console.log(`Backfilled ${rows.length} daily_closes rows across ${ALL_SYMBOLS.length} symbols.`);
