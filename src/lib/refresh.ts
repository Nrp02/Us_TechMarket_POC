import { readRows } from "@/lib/db-read";
import { fetchLatestEarnings, fetchMetrics, fetchQuote } from "@/lib/finnhub";
import { isFomcDay } from "@/lib/fomc-calendar";
import { FRED_SERIES, fetchLatestTwo } from "@/lib/fred";
import { tradingDay } from "@/lib/market";
import { type DailyCloseRow, deriveSymbolRows, type PriceRow, type SnapshotRow } from "@/lib/refresh-rows";
import { fetchFilings } from "@/lib/sec-edgar";
import { db } from "@/lib/supabase";
import { CIK_BY_SYMBOL, INDEX_SYMBOLS, TOP_20_SYMBOLS, TRACKED_STOCK_SYMBOLS } from "@/lib/symbols";
import { fetchDayData } from "@/lib/yahoo";

// Populates price_cache and intraday_snapshots for every tracked symbol. The
// pages themselves only ever read the database, so a page view costs no
// upstream API calls and cannot trip a rate limit.

/** Finnhub allows 60 calls/min; this keeps a burst well inside that. */
const CONCURRENCY = 5;
const REFRESH_SYMBOLS = [...TRACKED_STOCK_SYMBOLS, ...INDEX_SYMBOLS];

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

/** FRED's macro series update monthly at most; same "check first, fetch only if needed" shape as fundamentals above. */
const MACRO_STALE_DAYS = 7;
// DGS10 is published every business day; a week-old yield would misdescribe the session.
const DAILY_MACRO_STALE_HOURS = 12;
const DAILY_MACRO_SERIES: ReadonlySet<string> = new Set([FRED_SERIES.tenYearTreasury]);

/**
 * One row per FRED series (CPI, unemployment, GDP, fed funds rate, 10-year
 * Treasury yield), refreshed only when missing or stale. Market-wide, not per-symbol, so this runs once
 * per refresh cycle rather than inside the per-symbol loop below. Its own
 * try/catch at the call site: a FRED outage must not fail the whole
 * ingestion job over a low-frequency secondary fetch.
 */
async function refreshMacroIndicators(): Promise<void> {
  const cached = await readRows<{ series_id: string; updated_at: string }>("refresh-macro", (signal) =>
    db.from("macro_indicators").select("series_id, updated_at").abortSignal(signal).retry(false),
  );
  const staleCutoff = (seriesId: string) => Date.now() - (DAILY_MACRO_SERIES.has(seriesId)
    ? DAILY_MACRO_STALE_HOURS * 60 * 60 * 1000
    : MACRO_STALE_DAYS * 24 * 60 * 60 * 1000);
  const fresh = new Set(
    cached
      .filter((r) => new Date(r.updated_at).getTime() >= staleCutoff(r.series_id))
      .map((r) => r.series_id),
  );

  const rows: {
    series_id: string;
    latest_date: string;
    latest_value: number | null;
    prior_date: string | null;
    prior_value: number | null;
    updated_at: string;
  }[] = [];

  for (const seriesId of Object.values(FRED_SERIES)) {
    if (fresh.has(seriesId)) continue;
    try {
      const [latest, prior] = await fetchLatestTwo(seriesId);
      if (!latest) continue;
      rows.push({
        series_id: seriesId,
        latest_date: latest.date,
        latest_value: latest.value,
        prior_date: prior?.date ?? null,
        prior_value: prior?.value ?? null,
        updated_at: new Date().toISOString(),
      });
    } catch {
      // Left missing/stale; the next run's staleness check retries it.
    }
  }

  // Whether today is a scheduled FOMC decision day, stored explicitly per
  // the ticket's own acceptance criterion ("stores ... whether today was an
  // FOMC decision day") rather than left as something only computed at read
  // time. No upstream call (the calendar is hardcoded), so this is refreshed
  // every tick regardless of staleness — cheap, and always correct for
  // today. The "outcome" half of that criterion (whether the rate actually
  // changed) is deliberately not duplicated into a second value here: it's
  // already derivable by comparing this same tick's FEDFUNDS row, stored
  // alongside it above.
  rows.push({
    series_id: "FOMC_DECISION_DAY",
    latest_date: tradingDay(),
    latest_value: isFomcDay(tradingDay()) ? 1 : 0,
    prior_date: null,
    prior_value: null,
    updated_at: new Date().toISOString(),
  });

  if (rows.length) {
    const { error } = await db.from("macro_indicators").upsert(rows, { onConflict: "series_id" });
    if (error) throw new Error(`macro_indicators upsert: ${error.message}`);
  }
}

export async function refreshMarketData(): Promise<RefreshResult> {
  // Average volume moves slowly, so it is only re-fetched when missing. That
  // keeps a warm run at one Finnhub call per symbol.
  // A failed read throws rather than reading as "nothing cached", which would
  // re-fetch every symbol's metrics and fundamentals in one tick.
  const cached = await readRows<{ symbol: string; avg_volume: number | null }>("refresh-avg-volume", (signal) =>
    db.from("price_cache").select("symbol, avg_volume").abortSignal(signal).retry(false),
  );
  const knownAvg = new Map(cached.map((r) => [r.symbol, r.avg_volume]));

  // Fundamentals are only re-fetched when missing or stale, same "check first,
  // fetch only if needed" shape as knownAvg above — a warm run makes zero
  // fundamentals-related upstream calls once every tracked stock has a fresh row.
  const cachedFundamentals = await readRows<{ symbol: string; updated_at: string }>("refresh-fundamentals", (signal) =>
    db.from("fundamentals").select("symbol, updated_at").abortSignal(signal).retry(false),
  );
  const staleCutoff = Date.now() - FUNDAMENTALS_STALE_DAYS * 24 * 60 * 60 * 1000;
  const freshFundamentals = new Set(
    cachedFundamentals
      .filter((r) => new Date(r.updated_at).getTime() >= staleCutoff)
      .map((r) => r.symbol),
  );

  const failed: string[] = [];
  const priceRows: PriceRow[] = [];
  const snapshotRows: SnapshotRow[] = [];
  const dailyCloseRows: DailyCloseRow[] = [];
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

  try {
    await refreshMacroIndicators();
  } catch {
    // A FRED outage must not fail the whole ingestion job — the next run's
    // staleness check retries it.
  }

  await mapLimit(REFRESH_SYMBOLS, CONCURRENCY, async (symbol) => {
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

      const rows = deriveSymbolRows({ symbol, quote, day, avgVolume, now: new Date() });
      priceRows.push(rows.price);
      snapshotRows.push(...rows.snapshots);
      if (rows.dailyClose) dailyCloseRows.push(rows.dailyClose);

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
    symbols: REFRESH_SYMBOLS.length,
    prices: priceRows.length,
    snapshots: deduped.length,
    failed,
  };
}
