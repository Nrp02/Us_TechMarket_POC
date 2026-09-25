// YTD/MTD return, computed from daily_closes rows. Pure and free of any
// database import, same reason closing-price.ts and news-category.ts are —
// so the test runner can load it (see lib/supabase.ts's module-load throw).
//
// Baseline is the first stored trading day on or after the start of the
// current ET year/month, not the previous close — matching the spec's
// "first trading day of the current year / month vs. the latest close".

export type DailyClose = { tradingDay: string; close: number };

export type PeriodPerformance = {
  ytdPercent: number | null;
  mtdPercent: number | null;
};

function percentChange(from: number, to: number): number {
  return ((to - from) / from) * 100;
}

/** First row (by tradingDay) at or after `from`, out of rows sorted ascending. */
function firstOnOrAfter(rows: DailyClose[], from: string): DailyClose | null {
  return rows.find((row) => row.tradingDay >= from) ?? null;
}

/**
 * `rows` need not be sorted; `today` is the ET trading day ("YYYY-MM-DD") the
 * latest close is measured against. Null fields mean insufficient history
 * (e.g. a symbol newly added, or no row on/after the period's start), never a
 * wrong number standing in for one.
 */
export function computePeriodPerformance(
  rows: DailyClose[],
  today: string,
): PeriodPerformance {
  if (rows.length === 0) return { ytdPercent: null, mtdPercent: null };

  const sorted = [...rows].sort((a, b) => a.tradingDay.localeCompare(b.tradingDay));
  const latest = sorted[sorted.length - 1];

  const yearStart = `${today.slice(0, 4)}-01-01`;
  const monthStart = `${today.slice(0, 7)}-01`;

  const ytdBase = firstOnOrAfter(sorted, yearStart);
  const mtdBase = firstOnOrAfter(sorted, monthStart);

  return {
    ytdPercent: ytdBase ? percentChange(ytdBase.close, latest.close) : null,
    mtdPercent: mtdBase ? percentChange(mtdBase.close, latest.close) : null,
  };
}
