// One-time backfill of supabase/migrations/0011_fundamentals.sql's
// `fundamentals` table for all Top-20 symbols, calling Finnhub directly.
//
// Run with: npm run backfill-fundamentals
//
// Root cause this exists to fix: src/lib/refresh.ts only ever writes
// `fundamentals` from inside refreshMarketData, which /api/refresh refuses to
// run outside market hours. A deploy landing after Friday's close leaves the
// table empty all weekend with nothing to backfill it — fundamentals data has
// no market-hours dependency at all, so it shouldn't wait behind a gate that
// exists for price freshness. This is a one-off, human-triggered script
// exactly like backfill-daily-closes.mts: it calls Finnhub directly rather
// than through the app, so it never touches /api/refresh's CRON_SECRET gate.
//
// The refresh job's own 7-day staleness re-fetch (FUNDAMENTALS_STALE_DAYS in
// refresh.ts) is left untouched — it's the passive safety net that keeps this
// self-healing if this script is never rerun by hand.
import { fetchLatestEarnings, fetchMetrics } from "../src/lib/finnhub.ts";
import { db } from "../src/lib/supabase.ts";
import { TOP_20_SYMBOLS } from "../src/lib/symbols.ts";

/** Finnhub allows 60 calls/min; this keeps a burst well inside that, same as refresh.ts. */
const CONCURRENCY = 5;

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
  eps_growth_quarterly_yoy: number | null;
  eps_growth_ttm_yoy: number | null;
  revenue_growth_quarterly_yoy: number | null;
  revenue_growth_ttm_yoy: number | null;
  gross_margin_ttm: number | null;
  net_margin_ttm: number | null;
  latest_earnings_period: string | null;
  latest_earnings_surprise_percent: number | null;
  updated_at: string;
};

const failed: string[] = [];

const rows = (
  await mapLimit(TOP_20_SYMBOLS, CONCURRENCY, async (symbol): Promise<Row | null> => {
    try {
      const [metrics, earnings] = await Promise.all([
        fetchMetrics(symbol),
        fetchLatestEarnings(symbol),
      ]);
      console.log(`${symbol}: fetched`);
      return {
        symbol,
        eps_growth_quarterly_yoy: metrics.epsGrowthQuarterlyYoy,
        eps_growth_ttm_yoy: metrics.epsGrowthTtmYoy,
        revenue_growth_quarterly_yoy: metrics.revenueGrowthQuarterlyYoy,
        revenue_growth_ttm_yoy: metrics.revenueGrowthTtmYoy,
        gross_margin_ttm: metrics.grossMarginTtm,
        net_margin_ttm: metrics.netMarginTtm,
        latest_earnings_period: earnings?.period ?? null,
        latest_earnings_surprise_percent: earnings?.surprisePercent ?? null,
        updated_at: new Date().toISOString(),
      };
    } catch (err) {
      failed.push(symbol);
      console.error(`${symbol}: failed — ${(err as Error).message}`);
      return null;
    }
  })
).filter((row): row is Row => row !== null);

if (!rows.length) {
  console.error("No rows fetched — aborting without writing anything.");
  process.exit(1);
}

const { error } = await db.from("fundamentals").upsert(rows, { onConflict: "symbol" });
if (error) throw new Error(`fundamentals upsert: ${error.message}`);

console.log(
  `Backfilled ${rows.length} fundamentals rows across ${TOP_20_SYMBOLS.length} symbols` +
    (failed.length ? ` (${failed.length} failed: ${failed.join(", ")})` : "") +
    ".",
);
