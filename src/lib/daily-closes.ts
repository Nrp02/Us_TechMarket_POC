// The one reader of daily_closes history. Every caller wants the same thing —
// each symbol's closes up to a day, oldest first — and the table outgrows a
// single PostgREST page fast (measured: 6 index symbols x 370 retained days
// hit 1512 rows, silently truncated to 1000). Paging, ordering and numeric
// coercion live here so no caller can forget one of them.
import { readAllRows } from "./db-read.ts";
import { db } from "./supabase.ts";

export type DailyClose = {
  symbol: string;
  tradingDay: string;
  close: number;
  changePercent: number | null;
};

/** Every stored close for `symbols` on or before `until`, ordered by symbol then day. */
export async function readDailyCloses(label: string, symbols: readonly string[], until: string): Promise<DailyClose[]> {
  if (!symbols.length) return [];
  const rows = await readAllRows<{ symbol: string; trading_day: string; close: number; change_percent: number | null }>(
    label,
    (signal, start, end) =>
      db
        .from("daily_closes")
        .select("symbol, trading_day, close, change_percent", { count: "exact" })
        .in("symbol", [...symbols])
        .lte("trading_day", until)
        .order("symbol", { ascending: true })
        .order("trading_day", { ascending: true })
        .range(start, end)
        .abortSignal(signal),
  );
  return rows.map((row) => ({
    symbol: row.symbol,
    tradingDay: row.trading_day,
    close: Number(row.close),
    changePercent: row.change_percent == null ? null : Number(row.change_percent),
  }));
}
