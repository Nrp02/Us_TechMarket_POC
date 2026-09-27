import { readRowsWithCount } from "@/lib/db-read";
import { readDayNews } from "@/lib/day-news";
import { dayWindow, tradingDay } from "@/lib/market";
import { db } from "@/lib/supabase";
import type { Snapshot } from "@/lib/timeline";

// One trading day's stored snapshots and news for a set of symbols. Shared by
// the two things that rebuild a timeline: the intraday refresh route and the
// end-of-day summary job.

export type DayNews = {
  headline: string;
  summary: string | null;
  publishedAt: string;
};

export type DayDataBatch = {
  bySymbol: Map<string, { snapshots: Snapshot[]; news: DayNews[] }>;
  /** Reads that came back short of their exact count — see the note below. */
  truncated: string[];
};

/**
 * Snapshots and news are stored in UTC; a trading day is a New York date.
 * `dayWindow` narrows the query to the UTC bounds containing that ET day, and
 * the exact boundary is settled by comparing trading days below.
 *
 * Batched across every symbol in `symbols` rather than queried one at a time:
 * the day window is already shared, so there is nothing symbol-specific about
 * the query shape. This is what keeps the Supabase cost fixed at two round trips
 * no matter how many stocks the caller covers, instead of two per symbol.
 */
export async function loadDayDataBatch(
  symbols: string[],
  day: string,
): Promise<DayDataBatch> {
  const { from, to } = dayWindow(day);

  // Through readRowsWithCount rather than awaited directly, so a Supabase error
  // is retried and then raised instead of arriving as `data: null` and being
  // read as "this day had no snapshots" — the defect lib/db-read.ts documents.
  // The *count* half stays reported rather than thrown, which is deliberate: a
  // job can finish its work and carry the problem out in its response, where a
  // page cannot, so this keeps the `truncated` contract its two callers already
  // collect (timeline-rebuild.ts and daily-summary.ts).
  // The news half pages past the row ceiling (see day-news.ts), so only the
  // snapshot read can still come back short.
  const [snapshotResult, newsItems] = await Promise.all([
    readRowsWithCount<Record<string, unknown>>("day-snapshots", (signal) =>
      db
        .from("intraday_snapshots")
        .select("symbol, price, volume, snapshot_at", { count: "exact" })
        .in("symbol", symbols)
        .gte("snapshot_at", from)
        .lt("snapshot_at", to)
        .order("snapshot_at", { ascending: true })
        .abortSignal(signal),
    ),
    readDayNews({ symbols }, day),
  ]);

  // PostgREST caps a response at its max-rows setting (1000 by default) and
  // says nothing when it does — the reply is simply short. Batching made that
  // reachable: one query now carries every symbol's rows where each used to
  // carry one symbol's, and a silent truncation would drop whole stocks'
  // snapshots and quietly rebuild their timelines from partial data. Comparing
  // the returned rows against the exact count turns that into a reported
  // failure. Measured at 671 rows for 20 symbols on a normal session, so this
  // is headroom monitoring, not an expected path.
  const truncated: string[] = [];
  if (snapshotResult.count != null && snapshotResult.count > snapshotResult.rows.length) {
    truncated.push(
      `intraday_snapshots: row cap hit — ${snapshotResult.rows.length} of ${snapshotResult.count} rows returned, so timelines would be rebuilt from partial data`,
    );
  }

  const bySymbol = new Map<string, { snapshots: Snapshot[]; news: DayNews[] }>(
    symbols.map((symbol) => [symbol, { snapshots: [], news: [] }]),
  );

  for (const row of snapshotResult.rows) {
    const at = new Date(row.snapshot_at as string);
    if (tradingDay(at) !== day) continue;
    bySymbol.get(row.symbol as string)?.snapshots.push({
      at,
      price: Number(row.price),
      volume: row.volume == null ? null : Number(row.volume),
    });
  }

  for (const item of newsItems) {
    const news: DayNews = { headline: item.headline, summary: item.summary, publishedAt: item.publishedAt };
    for (const symbol of item.relatedSymbols) bySymbol.get(symbol)?.news.push(news);
  }

  return { bySymbol, truncated };
}
