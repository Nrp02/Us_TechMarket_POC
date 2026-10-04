import { DatePicker } from "@/components/date-picker";
import { MarketOverview } from "@/components/market-overview";
import { MarketStory } from "@/components/market-story";
import { NewsTeaser } from "@/components/news-teaser";
import { SessionDigest } from "@/components/session-digest";
import { activityDateLabel, buildActivityDateOptions } from "@/lib/activity-date";
import { formatDayLong } from "@/lib/format";
import { tradingDay } from "@/lib/market";
import { getNewsTeaser } from "@/lib/queries-news";
import { getMarketSession } from "@/lib/queries";

// The Market page — whole-market overview, replacing the old personalized
// Home. There is no separate full-table page: the "Stocks" nav item routes
// straight to Today's Activity (a single stock's page, NVDA by default) —
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

  const [session, news] = await Promise.all([
    getMarketSession(requestedDate),
    // The teaser deliberately shows recent news regardless of the selected Session.
    getNewsTeaser(3),
  ]);
  const { day: currentDay, availableDates, indices, trackedStocks,
    story: marketStory, indexDailyCloses, topMovers, sectorAverages } = session;
  const today = tradingDay();

  const dateOptions = buildActivityDateOptions(availableDates, currentDay, today, (d) =>
    d === session.defaultDay ? "/" : `/?date=${d}`,
  );

  return (
    // Keyed on the day: the arrival animations are one-shot CSS keyframes that
    // play on mount, and a ?date= change re-renders this same route, so React
    // kept the old nodes and only the few whose own keys changed replayed —
    // some charts redrew and the rest sat still. A new key remounts the page,
    // the same as navigating to it.
    <div key={currentDay} className="page-enter flex flex-col gap-10 pb-10">
      <h1 className="sr-only">
        {session.hasSession
          ? `Market session of ${formatDayLong(session.day)}`
          : "US TechMarket — no session recorded yet"}
      </h1>

      {/* The page's line, then the overview card by card (globals.css, "The
          page arriving"); the story and the news fade in after them. */}
      <div className="flex justify-end" data-enter="0">
        <DatePicker dateLabel={activityDateLabel(currentDay, today)} options={dateOptions} />
      </div>

      <SessionDigest tickers={trackedStocks} />

      <MarketOverview tickers={indices} />

      <MarketStory
        story={marketStory}
        topMovers={topMovers}
        sectorAverages={sectorAverages}
        indices={indices}
        indexDailyCloses={indexDailyCloses}
        day={currentDay}
      />

      {/* Market News runs full width, its three articles in a row rather than
          a column. */}
      <NewsTeaser items={news} />
    </div>
  );
}
