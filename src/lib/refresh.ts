import { hasReliableClose, reconcileClose } from "@/lib/closing-price";
import { fetchLatestEarnings, fetchMetrics, fetchQuote } from "@/lib/finnhub";
import { tradingDay } from "@/lib/market";
import { fetchFilings } from "@/lib/sec-edgar";
import { db } from "@/lib/supabase";
import { ALL_SYMBOLS, CIK_BY_SYMBOL, TOP_20_SYMBOLS } from "@/lib/symbols";
import { fetchDayData } from "@/lib/yahoo";

// Populates price_cache and intraday_snapshots for every tracked symbol. The
// pages themselves only ever read the database, so a page view costs no
// upstream API calls and cannot trip a rate limit.

/** Finnhub allows 60 calls/min; this keeps a burst well inside that. */
const CONCURRENCY = 5;

const SNAPSHOT_MINUTES = 15;

/**
 * Snaps a bar to the 15-minute grid the schema documents. The upstream feed
 * appends a live, partially-formed bar stamped with the current time, so
 * without this every refresh would leave an extra off-grid point behind and the
 * snapshots would drift away from an even cadence.
 */
function snapshotSlot(at: Date): string {
  const slot = new Date(at);
  slot.setUTCSeconds(0, 0);
  slot.setUTCMinutes(Math.floor(slot.getUTCMinutes() / SNAPSHOT_MINUTES) * SNAPSHOT_MINUTES);
  return slot.toISOString();
}

/** Bounded worker pool over `items`. Private: `refreshMarketData` is its only caller. */
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

type PriceRow = {
  symbol: string;
  price: number;
  change: number;
  change_percent: number;
  volume: number | null;
  avg_volume: number | null;
  updated_at: string;
};

export type RefreshResult = {
  symbols: number;
  prices: number;
  snapshots: number;
  failed: string[];
};

/** This data changes quarterly; a 15-minute refresh cadence would be pure waste. */
const FUNDAMENTALS_STALE_DAYS = 7;

/** Matches sec_filings' own retention window (migration 0013) — no point fetching what the next prune pass would discard. */
const SEC_FILINGS_RETENTION_DAYS = 370;

export async function refreshMarketData(): Promise<RefreshResult> {
  // Average volume moves slowly, so it is only re-fetched when missing. That
  // keeps a warm run at one Finnhub call per symbol.
  const { data: cached } = await db
    .from("price_cache")
    .select("symbol, avg_volume");
  const knownAvg = new Map(
    (cached ?? []).map((r) => [r.symbol as string, r.avg_volume as number | null]),
  );

  // Fundamentals are only re-fetched when missing or stale, same "check first,
  // fetch only if needed" shape as knownAvg above — a warm run makes zero
  // fundamentals-related upstream calls once every tracked stock has a fresh row.
  const { data: cachedFundamentals } = await db
    .from("fundamentals")
    .select("symbol, updated_at");
  const staleCutoff = Date.now() - FUNDAMENTALS_STALE_DAYS * 24 * 60 * 60 * 1000;
  const freshFundamentals = new Set(
    (cachedFundamentals ?? [])
      .filter((r) => new Date(r.updated_at as string).getTime() >= staleCutoff)
      .map((r) => r.symbol as string),
  );

  const failed: string[] = [];
  const priceRows: PriceRow[] = [];
  const snapshotRows: {
    symbol: string;
    price: number;
    volume: number | null;
    snapshot_at: string;
  }[] = [];
  const dailyCloseRows: {
    symbol: string;
    trading_day: string;
    close: number;
    change: number;
    change_percent: number;
  }[] = [];
  const fundamentalsRows: {
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
  }[] = [];
  const filingRows: {
    accession_number: string;
    symbol: string;
    form: string;
    filing_date: string;
    item_codes: string;
    fetched_at: string;
  }[] = [];

  await mapLimit(ALL_SYMBOLS, CONCURRENCY, async (symbol) => {
    try {
      const [quote, day] = await Promise.all([
        fetchQuote(symbol),
        fetchDayData(symbol),
      ]);
      if (!quote) {
        failed.push(symbol);
        return;
      }

      // Relative volume is only ever shown for stocks, not the index proxies.
      let avgVolume = knownAvg.get(symbol) ?? null;
      const needsAvgVolume = avgVolume == null && TOP_20_SYMBOLS.includes(symbol);
      const needsFundamentals =
        TOP_20_SYMBOLS.includes(symbol) && !freshFundamentals.has(symbol);

      // One /stock/metric call serves both needs (avg_volume here, growth/
      // margin fields below) — this used to be two separate functions hitting
      // the identical endpoint, doubling the Finnhub call for any symbol
      // needing both in the same cycle. Run un-caught when avg_volume is
      // needed, so a failure here still fails the whole symbol exactly as
      // fetchAvgVolume's failure did before this merge.
      let metrics: Awaited<ReturnType<typeof fetchMetrics>> | null = null;
      if (needsAvgVolume) {
        metrics = await fetchMetrics(symbol);
        avgVolume = metrics.avgVolume;
      }

      // Once the session has printed a close, that print is what gets stored
      // rather than the live quote — Finnhub's has already moved on the liquid
      // names by the time the closing-window tick runs. Mid-session this is the
      // quote untouched. See lib/closing-price.ts for the measurement.
      const settled = reconcileClose(quote, day.bars);

      priceRows.push({
        symbol,
        price: settled.price,
        change: settled.change,
        change_percent: settled.changePercent,
        volume: day.volume,
        avg_volume: avgVolume,
        updated_at: new Date().toISOString(),
      });

      for (const bar of day.bars) {
        snapshotRows.push({
          symbol,
          price: bar.price,
          volume: bar.volume,
          snapshot_at: snapshotSlot(bar.at),
        });
      }

      // Only write a daily-close row once reconcileClose actually substituted
      // the official closing print for `settled`, not merely once a bar at/
      // after the bell exists — a closing bar with a malformed quote baseline
      // makes reconcileClose fall back to the raw (possibly drifted) quote,
      // and unlike price_cache this table has no next tick to self-correct on
      // (see hasReliableClose's own doc comment). Idempotent: a repeated
      // closing-window tick re-upserts the same (symbol, trading_day) row,
      // which only changes if a later tick finds a better closing bar. No new
      // upstream call — reuses settled/day.bars.
      if (hasReliableClose(quote, day.bars)) {
        dailyCloseRows.push({
          symbol,
          trading_day: tradingDay(),
          close: settled.price,
          change: settled.change,
          change_percent: settled.changePercent,
        });
      }

      // Fundamentals apply to companies, not the index ETF proxies, and are
      // only fetched when missing or stale (see FUNDAMENTALS_STALE_DAYS). Its
      // own try/catch: a fundamentals failure must not mark the symbol's price
      // data — already pushed above — as failed too. Reuses `metrics` from
      // above when the avg_volume fetch already got it this cycle, so a
      // symbol needing both makes exactly one /stock/metric call, not two.
      if (needsFundamentals) {
        try {
          const [resolvedMetrics, earnings] = await Promise.all([
            metrics ? Promise.resolve(metrics) : fetchMetrics(symbol),
            fetchLatestEarnings(symbol),
          ]);
          fundamentalsRows.push({
            symbol,
            eps_growth_quarterly_yoy: resolvedMetrics.epsGrowthQuarterlyYoy,
            eps_growth_ttm_yoy: resolvedMetrics.epsGrowthTtmYoy,
            revenue_growth_quarterly_yoy: resolvedMetrics.revenueGrowthQuarterlyYoy,
            revenue_growth_ttm_yoy: resolvedMetrics.revenueGrowthTtmYoy,
            gross_margin_ttm: resolvedMetrics.grossMarginTtm,
            net_margin_ttm: resolvedMetrics.netMarginTtm,
            latest_earnings_period: earnings?.period ?? null,
            latest_earnings_surprise_percent: earnings?.surprisePercent ?? null,
            updated_at: new Date().toISOString(),
          });
        } catch {
          // Left missing/stale; the next run's staleness check retries it.
        }
      }

      // SEC 8-K filings apply to companies, not the index ETF proxies, and
      // are re-fetched every tick (unlike fundamentals, a filing can appear
      // at any point in the trading day) — dedup on accession_number in the
      // upsert below is what keeps a repeat fetch cheap. Own try/catch: a
      // filings failure must not mark the symbol's price data as failed too.
      if (TOP_20_SYMBOLS.includes(symbol)) {
        try {
          const filings = await fetchFilings(CIK_BY_SYMBOL[symbol]);
          const cutoff = Date.now() - SEC_FILINGS_RETENTION_DAYS * 24 * 60 * 60 * 1000;
          for (const filing of filings) {
            if (filing.form !== "8-K") continue;
            if (new Date(filing.filingDate).getTime() < cutoff) continue;
            filingRows.push({
              accession_number: filing.accessionNumber,
              symbol,
              form: filing.form,
              filing_date: filing.filingDate,
              item_codes: filing.itemCodes,
              fetched_at: new Date().toISOString(),
            });
          }
        } catch {
          // Left unfetched this tick; the next 15-minute tick retries.
        }
      }
    } catch {
      failed.push(symbol);
    }
  });

  if (priceRows.length) {
    const { error } = await db
      .from("price_cache")
      .upsert(priceRows, { onConflict: "symbol" });
    if (error) throw new Error(`price_cache upsert: ${error.message}`);
  }

  // The live bar can snap into the same slot as the last completed one, and
  // Postgres refuses an upsert that touches a row twice in one statement.
  // Latest value wins, so the in-progress slot carries the freshest price.
  const bySlot = new Map(
    snapshotRows.map((row) => [`${row.symbol}@${row.snapshot_at}`, row]),
  );
  const deduped = [...bySlot.values()];

  if (deduped.length) {
    const { error } = await db
      .from("intraday_snapshots")
      .upsert(deduped, { onConflict: "symbol,snapshot_at" });
    if (error) throw new Error(`intraday_snapshots upsert: ${error.message}`);
  }

  if (dailyCloseRows.length) {
    const { error } = await db
      .from("daily_closes")
      .upsert(dailyCloseRows, { onConflict: "symbol,trading_day" });
    if (error) throw new Error(`daily_closes upsert: ${error.message}`);
  }

  if (fundamentalsRows.length) {
    const { error } = await db
      .from("fundamentals")
      .upsert(fundamentalsRows, { onConflict: "symbol" });
    if (error) throw new Error(`fundamentals upsert: ${error.message}`);
  }

  if (filingRows.length) {
    // ignoreDuplicates: this is an append-only event log keyed on SEC's own
    // accession number, not a per-symbol cache — a repeat fetch across ticks
    // must leave an already-stored filing untouched, never overwrite it.
    const { error } = await db
      .from("sec_filings")
      .upsert(filingRows, { onConflict: "accession_number", ignoreDuplicates: true });
    if (error) throw new Error(`sec_filings upsert: ${error.message}`);
  }

  return {
    symbols: ALL_SYMBOLS.length,
    prices: priceRows.length,
    snapshots: deduped.length,
    failed,
  };
}
