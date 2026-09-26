import { activityDateLabel, buildActivityDateOptions, resolveActivityDay } from "@/lib/activity-date";
import { DatePicker } from "@/components/date-picker";
import { StocksTable } from "@/components/stocks-table";
import { TopMovers } from "@/components/top-movers";
import { tradingDay } from "@/lib/market";
import { getActivityDates, getDayTickers, getTickers } from "@/lib/queries";
import { TOP_20_SYMBOLS } from "@/lib/symbols";

// The full, un-personalized Top 20 table — the old Home page's "My
// Watchlist" table and Top Movers panel, moved here and stripped of the
// watchlist cap/selection (ticket 03). Every visitor sees the same 20 rows.
//
// The date picker (ticket 06) sits where the old "add stock"/watchlist
// picker control used to be, in the table's own SectionHeading meta slot.

export const metadata = { title: "Stocks" };

// Headroom for the read path's retry budget — see the note on the same
// export on the Market page.
export const maxDuration = 30;

export default async function Stocks({
  searchParams,
}: PageProps<"/stocks">) {
  const { date } = await searchParams;
  const requestedDate = typeof date === "string" ? date : undefined;

  const availableDates = await getActivityDates();
  const day = resolveActivityDay(requestedDate, availableDates);
  const today = tradingDay();
  const currentDay = day ?? availableDates[0] ?? today;

  // No live/historical branch to hide here, unlike getActivity: getDayTickers
  // and getTickers are two genuinely different reads (live price_cache vs.
  // daily_closes + intraday_snapshots), so the page picks between them
  // directly rather than pushing the choice into a shared function.
  const top20 = day ? await getDayTickers(TOP_20_SYMBOLS, day) : await getTickers(TOP_20_SYMBOLS);

  const dateOptions = buildActivityDateOptions(availableDates, currentDay, today, (d) =>
    d === availableDates[0] ? "/stocks" : `/stocks?date=${d}`,
  );

  return (
    <div className="page-enter flex flex-col gap-10 pb-10">
      <h1 className="sr-only">Stocks — all 20 tracked US technology stocks</h1>

      {/* Stocks table and Top Movers side by side — same measured breakpoint
          the old Home page derived: the table's panel needs 748px, Top Movers
          needs about 300px, plus 24px gap and 48px shell padding = 1120px,
          rounded up to 1130. */}
      <div className="grid grid-cols-1 gap-10 min-[1130px]:grid-cols-[minmax(748px,1fr)_minmax(300px,360px)] min-[1130px]:gap-6">
        <StocksTable
          tickers={top20}
          meta={<DatePicker dateLabel={activityDateLabel(currentDay, today)} options={dateOptions} />}
        />
        <TopMovers tickers={top20} />
      </div>
    </div>
  );
}
