import { DatePicker } from "@/components/date-picker";
import { MarketOverview } from "@/components/market-overview";
import { NewsTeaser } from "@/components/news-teaser";
import { SessionDigest } from "@/components/session-digest";
import { activityDateLabel, buildActivityDateOptions, resolveActivityDay } from "@/lib/activity-date";
import { formatDayLong } from "@/lib/format";
import { tradingDay } from "@/lib/market";
import { getActivityDates, getDayTickers, getNewsTeaser, getSessionStamp, getTickers } from "@/lib/queries";
import { INDEX_SYMBOLS, TOP_20_SYMBOLS } from "@/lib/symbols";

// The Market page — whole-market overview, replacing the old personalized
// Home. The full Top-20 table and Top Movers moved to /stocks (ticket 03);
// this page stays scoped to "what happened to the market today," market-wide.
//
// Reads cached tables only, never an upstream API.
//
// Deliberately not "force-dynamic": that setting also means revalidate 0, which
// switched off the data cache in lib/queries.ts and made every render re-query
// Supabase.

// Headroom for the read path's retry budget, not an expectation. A healthy
// render is ~93ms on a cache hit and ~547ms on a miss; the ceiling only matters
// when lib/db-read.ts is spending its per-attempt timeouts, and getSparklines is
// two sequential reads, so the worst case is ~13s. The page routes previously
// set nothing and ran on the platform default, which is below that.
export const maxDuration = 30;

export default async function Market({
  searchParams,
}: PageProps<"/">) {
  const { date } = await searchParams;
  const requestedDate = typeof date === "string" ? date : undefined;

  const availableDates = await getActivityDates();
  const day = resolveActivityDay(requestedDate, availableDates);
  const today = tradingDay();
  const currentDay = day ?? availableDates[0] ?? today;

  const allSymbols = [...INDEX_SYMBOLS, ...TOP_20_SYMBOLS];
  // News is not date-scoped here — the teaser's own job is "most recent 3,
  // whatever day" regardless of which session the figures above it show (same
  // reasoning getNewsTeaser's doc comment already states).
  const [all, news, session] = await Promise.all([
    day ? getDayTickers(allSymbols, day) : getTickers(allSymbols),
    getNewsTeaser(3),
    getSessionStamp(),
  ]);
  const bySymbol = new Map(all.map((t) => [t.symbol, t]));
  const indices = INDEX_SYMBOLS.map((s) => bySymbol.get(s)).filter((t) => t != null);
  const top20 = TOP_20_SYMBOLS.map((s) => bySymbol.get(s)).filter((t) => t != null);

  const dateOptions = buildActivityDateOptions(availableDates, currentDay, today, (d) =>
    d === availableDates[0] ? "/" : `/?date=${d}`,
  );

  return (
    <div className="page-enter flex flex-col gap-10 pb-10">
      <h1 className="sr-only">
        {session
          ? `Market session of ${formatDayLong(session.day)}`
          : "US TechMarket — no session recorded yet"}
      </h1>

      <div className="flex justify-end">
        <DatePicker dateLabel={activityDateLabel(currentDay, today)} options={dateOptions} />
      </div>

      <SessionDigest tickers={top20} />

      <MarketOverview tickers={indices} />

      {/* Market News runs full width, its three articles in a row rather than
          a column. */}
      <NewsTeaser items={news} />
    </div>
  );
}
