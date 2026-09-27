import { type DayDataBatch, loadDayDataBatch } from "@/lib/day-data";
import { db } from "@/lib/supabase";
import { buildTimeline } from "@/lib/timeline";

// Writing Today's Timeline to the database. The rules themselves are in
// timeline.ts and stay pure; this is only the read-rebuild-write around them.
//
// Called from two places, on purpose: the intraday refresh route (so the
// timeline exists while the session is still running) and the end-of-day
// summary job (which needs the same day data for its prompt anyway, and so
// passes it in rather than reading it twice). Rebuilding is free of AI and
// upstream calls, which is what makes running it repeatedly reasonable.

export type TimelineRow = {
  symbol: string;
  trading_day: string;
  event_at: string;
  kind: string;
  label: string;
  detail: string | null;
};

export function timelineRowsFor(
  symbol: string,
  day: string,
  rows: ReturnType<typeof buildTimeline>,
): TimelineRow[] {
  return rows.map((r) => ({
    symbol,
    trading_day: day,
    event_at: r.eventAt.toISOString(),
    kind: r.kind,
    label: r.label,
    detail: r.detail,
  }));
}

/**
 * Deletes and re-inserts every symbol's rows for `day` in one round trip each,
 * rather than one delete + one insert per symbol. Deleted and re-inserted
 * rather than upserted: a rebuild may drop a row (a flat day loses its
 * high/low pair), and an upsert alone would leave the stale one behind.
 */
export async function writeTimelines(
  symbols: string[],
  day: string,
  rows: TimelineRow[],
) {
  // Nothing to write means nothing to clear: wiping first and failing to insert
  // would leave the page with no timeline where it previously had a good one.
  if (!symbols.length) return;

  const { error: deleteError } = await db
    .from("timeline_events")
    .delete()
    .in("symbol", symbols)
    .eq("trading_day", day);
  if (deleteError) throw new Error(`timeline_events delete: ${deleteError.message}`);

  if (rows.length) {
    const { error } = await db.from("timeline_events").insert(rows);
    if (error) throw new Error(`timeline_events insert: ${error.message}`);
  }
}

/**
 * Rebuilds `day`'s timeline for each symbol from whatever is stored right now.
 *
 * Safe to call mid-session. `buildTimeline` recomputes the whole day from
 * scratch on every call rather than appending, so a partial session simply
 * produces a partial timeline: the open is the first snapshot, the high and low
 * are the extremes so far, and the close only appears once a snapshot actually
 * lands at or after the bell. Calling it again an hour later supersedes all of
 * that with the same rules applied to more data.
 *
 * `data` is the day already loaded by a caller that needs it anyway; `skip` is
 * checked just before each symbol, so a time budget can drop the rebuilds
 * nobody is waiting on (reported in `skipped`, never written).
 */
export async function rebuildTimelines(
  symbols: string[],
  day: string,
  options: { data?: DayDataBatch; skip?: (symbol: string) => boolean } = {},
): Promise<{ timelines: string[]; skipped: string[]; failed: string[] }> {
  const { bySymbol, truncated } = options.data ?? (await loadDayDataBatch(symbols, day));

  const timelines: string[] = [];
  const skipped: string[] = [];
  const failed: string[] = [...truncated];
  const symbolsToWrite: string[] = [];
  const rows: TimelineRow[] = [];

  for (const symbol of symbols) {
    if (options.skip?.(symbol)) {
      skipped.push(symbol);
      continue;
    }
    try {
      const data = bySymbol.get(symbol);

      // No snapshots means nothing to rebuild from; leave whatever is stored
      // rather than deleting a good timeline and writing an empty one.
      if (!data || !data.snapshots.length) continue;

      const built = buildTimeline(
        data.snapshots,
        data.news.map((n) => ({ at: new Date(n.publishedAt), headline: n.headline })),
      );
      if (!built.length) continue;

      symbolsToWrite.push(symbol);
      rows.push(...timelineRowsFor(symbol, day, built));
      timelines.push(symbol);
    } catch (error) {
      failed.push(
        `${symbol} timeline: ${error instanceof Error ? error.message : "failed"}`,
      );
    }
  }

  await writeTimelines(symbolsToWrite, day, rows);

  return { timelines, skipped, failed };
}
