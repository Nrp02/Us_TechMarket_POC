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
 * `rows` need not be sorted. `day` is the ET session being described and
 * `sessionPrice` its own price — the latest quote live, the close afterwards.
 * The session is measured through that price rather than through its stored
 * close row, which only exists once the official closing print is confirmed
 * (see reliableCloseDay). The baseline is still a stored row — the first on or
 * after the period's start and no later than `day` — so a later close can never
 * leak into a historical session. Null means no such stored row, never a
 * stand-in number.
 */
export function computePeriodPerformance(
  rows: DailyClose[],
  day: string,
  sessionPrice: number,
): PeriodPerformance {
  const sorted = rows
    .filter((row) => row.tradingDay <= day)
    .sort((a, b) => a.tradingDay.localeCompare(b.tradingDay));

  const ytdBase = firstOnOrAfter(sorted, `${day.slice(0, 4)}-01-01`);
  const mtdBase = firstOnOrAfter(sorted, `${day.slice(0, 7)}-01`);

  return {
    ytdPercent: ytdBase ? percentChange(ytdBase.close, sessionPrice) : null,
    mtdPercent: mtdBase ? percentChange(mtdBase.close, sessionPrice) : null,
  };
}

/**
 * The line a YTD chart draws: this year's stored closes before `day`, then the
 * session's own price — the same year and end point computePeriodPerformance
 * measures, so the chart and the YTD figure beside it describe one span.
 */
export function ytdSeries(rows: DailyClose[], day: string, sessionPrice: number): DailyClose[] {
  const yearStart = `${day.slice(0, 4)}-01-01`;
  return [
    ...rows
      .filter((row) => row.tradingDay >= yearStart && row.tradingDay < day)
      .sort((a, b) => a.tradingDay.localeCompare(b.tradingDay))
      .map(({ tradingDay, close }) => ({ tradingDay, close })),
    { tradingDay: day, close: sessionPrice },
  ];
}
