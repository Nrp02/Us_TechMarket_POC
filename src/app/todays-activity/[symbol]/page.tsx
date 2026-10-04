import { notFound } from "next/navigation";
import type { CSSProperties } from "react";

import { ActivityStats } from "@/components/activity-stats";
import { WordReveal } from "@/components/arrival";
import { ActivityTimeline } from "@/components/activity-timeline";
import { CompanyLogo } from "@/components/company-logo";
import { DailySummaryCard } from "@/components/daily-summary-card";
import { DatePicker } from "@/components/date-picker";
import { IntradayChart } from "@/components/intraday-chart";
import { SectionHeading } from "@/components/section-heading";
import { StatusBadge } from "@/components/status-badge";
import { SymbolSwitcher } from "@/components/symbol-switcher";
import { TodaysStory } from "@/components/todays-story";
import { UpcomingEvents } from "@/components/upcoming-events";
import { activityDateLabel, buildActivityDateOptions } from "@/lib/activity-date";
import { formatChange, formatPercent, formatPrice } from "@/lib/format";
import { tradingDay } from "@/lib/market";
import { getActivity } from "@/lib/queries";
import { ALL_SYMBOLS, TOP_20 } from "@/lib/symbols";

// Alphabetical, not TOP_20's fixed by-market-cap order — a flat
// navigation list with no personalization is easiest to scan sorted by name.
const SWITCHER_STOCKS = [...TOP_20].sort((a, b) => a.symbol.localeCompare(b.symbol));

// One page per stock, reached through the nav card and the header switcher. There
// is no secondary tab bar by design — Today's Story below replaces the
// Overview/News/Events/Financials/Charts/Peers tabs the early mockups had.
//
// Reads cached tables only. No upstream call, and no AI call: the narrative was
// written once, after the close.
//
// Not "force-dynamic" — see the note on the Home page: it implies revalidate 0
// and disables the data cache getActivity depends on. The dynamic [symbol]
// segment (no generateStaticParams) is what keeps the route rendered per
// request.

// Every route shared the one <title> from layout.tsx, so NVDA and AAPL were
// indistinguishable in the tab strip, in history and in a bookmark — on a
// product whose unit of value is one page per stock.
//
// The tab now carries the session's move as well as the symbol, and that is
// utility rather than decoration. This is a once-a-day product: the realistic
// visit leaves three or four of these open across a lunch break, and a tab
// strip reading "NVDA −0.06%  AAPL +0.22%  AVGO −5.93%" answers the page's own
// question without any of them being focused. It stays inside the product's
// rules — a figure the ingestion job already stored, signed, stated, with no
// claim about why or what next.
//
// It reads from the same `unstable_cache`d query the page body uses, so within
// the 60s window it costs nothing. If the symbol is untracked the page 404s
// anyway; the fallback keeps the tab sane on the way there.
// Headroom for the read path's retry budget in lib/db-read.ts — see the note on
// the same export in app/(market)/page.tsx.
export const maxDuration = 30;

export async function generateMetadata({
  params,
  searchParams,
}: PageProps<"/todays-activity/[symbol]">) {
  const { symbol } = await params;
  const upper = symbol.toUpperCase();
  if (!ALL_SYMBOLS.includes(upper)) return { title: upper };
  const { date } = await searchParams;
  const activity = await getActivity(upper, typeof date === "string" ? date : undefined);
  if (!activity) return { title: upper };
  return { title: `${upper} ${formatPercent(activity.ticker.changePercent)}` };
}

export default async function TodaysActivityForSymbol({
  params,
  searchParams,
}: PageProps<"/todays-activity/[symbol]">) {
  const { symbol: raw } = await params;
  const symbol = raw.toUpperCase();
  const { date } = await searchParams;

  // "Is this a stock we track" is a question about the fixed Top 20 plus the
  // index proxies, so it is settled against that list rather than against the
  // database. It used to be inferred from a missing price_cache row, which
  // conflated an untracked ticker with a failed read — and since a failed read
  // arrived as an empty result, a transient Supabase blip rendered a 404 for a
  // stock that plainly exists. Reads now throw (lib/db-read.ts), so this check
  // is what keeps the two answers apart: unknown ticker → 404, failed read →
  // app/error.tsx, which is recoverable and never cached.
  if (!ALL_SYMBOLS.includes(symbol)) notFound();

  const requestedDate = typeof date === "string" ? date : undefined;
  const activity = await getActivity(symbol, requestedDate);

  // A tracked symbol with no price_cache row yet — before the first refresh has
  // ever run for it. The only case left after the guard above.
  if (!activity) notFound();

  const { ticker } = activity;
  const up = ticker.changePercent >= 0;

  const { availableDates, isHistorical } = activity;

  const today = tradingDay();
  const dateOptions = buildActivityDateOptions(
    availableDates,
    activity.sessionDay,
    today,
    (d) => `/todays-activity/${symbol}${d === activity.defaultDay ? "" : `?date=${d}`}`,
  );
  const dateLabel = activityDateLabel(activity.sessionDay, today);

  return (
    // Keyed on the day: the arrival animations are one-shot CSS keyframes that
    // play on mount, and a ?date= change re-renders this same route, so React
    // kept the old nodes and only the few whose own keys changed replayed —
    // some charts redrew and the rest sat still. A new key remounts the page,
    // the same as navigating to it.
    <div key={activity.sessionDay} className="page-enter flex flex-col gap-10 pb-10">
      {/* A two-column grid on a phone, a single flex row from 600 up.
          
          It was one flex row at every width, and on a phone that produced a
          header with four left edges and two right ones: logo 16, ticker 112,
          company name 112, change pill 119, price 156, badge flush at 374. The
          pill missing the ticker's axis by 7px is the tell — close enough to
          read as a mistake rather than as an offset, which is exactly how it
          was reported. `ml-auto` had given the price GROUP a right edge, but
          the group ends where the badge begins, so the numbers ended up
          floating in the middle of the line with nothing to align to.
          
          As a grid the logo hangs in column one and everything else — ticker,
          company, price, change, badge — runs down column two off a single
          axis. The axis comes from the logo's own width rather than a hardcoded
          indent, so it cannot drift if that badge is ever resized.
          
          From 680 it becomes three columns — logo, text, price — which is the
          same two-end reading the desktop header always had, and it stays a
          GRID rather than reverting to flex on purpose. As flex the row wrapped
          whenever its content did not fit, and the wrapped price group floated
          exactly as it did on the phone: measured at 600 and 640 the group
          landed on its own line with the numbers ending at 480 against a 576
          margin. A width breakpoint cannot fix that reliably either, because
          the pressure comes from the company name and those vary — NVIDIA is
          six characters where AMD's is twenty-two. Three grid columns cannot
          wrap at all; the 1fr text column absorbs the pressure and the name
          takes a second line instead. 680 is where the row first fits. */}
      {/* The header is the page's line: the ticker rises, the company and
          session follow a word at a time, then the price and the change land
          — revealed, not counted (globals.css, "The page's line"); then the
          stat cards one at a time and the chart ("The page arriving"). */}
      <header data-enter="0" className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-5 min-[680px]:grid-cols-[auto_minmax(0,1fr)_auto] min-[680px]:gap-x-6 min-[680px]:gap-y-0">
        <CompanyLogo symbol={ticker.symbol} name={ticker.name} eager />
        <div className="min-w-0">
          {/* Ticker only — the header is the switcher, not a company title.
              Wrapped in an h1 because the page had no heading at all: the
              ticker was a bare <button>, so a screen reader's heading list
              gave this page no identity. The button keeps its own type
              styling; the h1 is purely structural. */}
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="line-rise">
              <SymbolSwitcher symbol={ticker.symbol} stocks={SWITCHER_STOCKS} />
            </h1>
          </div>
        {/* w-fit: DatePicker's own root carries `ml-auto` (load-bearing for
            its News page placement, a wide row it right-aligns within) — as a
            block child of this grid's `minmax(0,1fr)` column it would
            otherwise stretch to the column's full width and shove the picker
            away from the text it's meant to sit beside. */}
        {/* `[&>:last-child]:ml-0` cancels that same ml-auto for the case
            where the row wraps (a phone, or a long company name): "session
            of" ended one line and the date sat at the far right of the next,
            read as two separate things. Wrapped, the date now starts the next
            line under the words it finishes. */}
        <div className="flex w-fit flex-wrap items-center gap-2 px-2 [&>:last-child]:ml-0">
          <p className="text-sm text-body">
            <WordReveal text={`${ticker.name} · session of`} />
          </p>
          <DatePicker dateLabel={dateLabel} options={dateOptions} />
        </div>
        </div>

        {/* The number the visitor came for, and it now sits at `text-figure`
            like every other large reading in the product.

            It was `text-display` — 52px, measured, which is the size of the
            Home page's h1 and 22px above the five stat cells directly beneath
            it. That inverted the page's own hierarchy twice over: the h1 here
            is the ticker at 30px, so the value shouted louder than the thing it
            describes, and the same figure appeared at two sizes depending on
            which card it was in.

            One step for a large mono reading, everywhere: Market Overview's
            index levels, the five stat cells, and this. What separates the
            price from the readings below is now position, the tinted change
            plate under it and the badge beside it — three channels, none of
            them size, which is the right way round for a value that is already
            the only figure in the header. */}
        {/* ml-auto, not just the header's justify-between. On a phone this
            block wraps to a line of its own, where justify-between has a single
            item to place and puts it at flex-start — so a right-aligned pair
            ended up floating at the LEFT of the screen. Measured at 390 before
            the fix: the group sat at x=16 with 103px of dead space to its
            right, and inside it the price started at x=53 while the change pill
            started at x=16, both flush right at 174. Two numbers ragged on the
            left against nothing, which is what it looked like.
            
            Right-aligned is the intended arrangement rather than something to
            abandon here — price over change, right-aligned, is this page's own
            established shape for the pair. Same trap as the news date picker
            — justify-between does nothing for a lone item on a wrapped line. */}
        <div className="col-start-2 flex flex-wrap items-center gap-x-2 gap-y-2 px-2 min-[680px]:col-start-3 min-[680px]:gap-x-5 min-[680px]:row-start-1 min-[680px]:px-0">
          {/* items-start on a phone: the price and the change sit on the
              column's axis like every other line in the header. items-end from
              600 up, where the group hangs off the right margin instead. */}
          <div className="flex flex-col items-start min-[680px]:items-end">
            <p className="font-mono text-figure font-medium tabular-nums text-ink">
              <span className="figure-rise inline-block">{formatPrice(ticker.price)}</span>
            </p>
            {/* The plate fades in where it rests while its figure rises
                inside it, both on the figure's beat: a plate risen through
                the slot showed its top edge before its text, like a shadow
                arriving first. */}
            <p
              className={`figure-plate mt-2 inline-flex items-center rounded-full px-3 py-1 font-mono text-base font-medium tabular-nums ${
                up
                  ? "bg-tint-up text-semantic-up"
                  : "bg-tint-down text-semantic-down"
              }`}
              style={{ "--figure-order": 1 } as CSSProperties}
            >
              <span className="figure-rise inline-block">
                {formatChange(ticker.change)} ({formatPercent(ticker.changePercent)})
              </span>
            </p>
          </div>
          {/* Same shared rule as the Home page badge and Top Movers ranking. */}
          <StatusBadge significant={ticker.significant} onGlass />
        </div>
      </header>

      {isHistorical && (
        <p className="panel pane-quiet px-4 py-3 text-xs leading-relaxed text-muted" data-enter="0">
          Viewing a past session. Relative volume below divides this day&apos;s
          volume by the 10-day average stored for that session. When the
          stored volume or average is missing, relative volume is unknown.
        </p>
      )}

      <ActivityStats activity={activity} />

      {/* The answer to the page's question sits under the figures it explains.
          It came after the timeline, which runs to ~40 rows: ~1,700px down on
          a laptop and ~5,000px on a phone (owner, 2026-10-05). */}
      <DailySummaryCard summary={activity.dailySummary} symbol={ticker.symbol} />

      {/* The chart takes the events panel as its sidebar, and the timeline runs
          the full width beneath them both.

          It was timeline and events sharing a 50/50 split, which paired the one
          panel that grows with the day's news against the one panel with four
          fixed rows. Measured on NVDA at 1200: the timeline 1152px tall, the
          events panel 285px, both 556px wide — 868 x 556 = 482,608px of bare
          backdrop closing the product's most important route, and it grew with
          the screen: 581,876px at 1920. Below 1024 the two stacked and the hole
          disappeared, so the desktop composition was strictly worse than the
          phone one.

          The chart is the better partner for a 285px panel: 528px against 285
          leaves 243px beside a sidebar rather than 868px beside a column, and
          the chart's own 560px minimum is what sets the breakpoint — 560 + 40
          of panel + 24 gap + 300 of events + 48 shell = 972, so 1130 (the
          breakpoint Home already derives for the same pairing) clears it. */}
      {/* grid-cols-1 is not redundant with the single implicit column: an
          implicit track is `auto`, which sizes to max-content, so the chart's
          560px minimum pushed the page 228px wider than a 390px viewport
          until this was stated. The Scrolling Island Rule needs the track to
          be able to shrink before the wrapper inside it can scroll. */}
      <div className="grid grid-cols-1 gap-10 min-[1130px]:grid-cols-[minmax(0,1fr)_minmax(300px,360px)] min-[1130px]:items-start min-[1130px]:gap-6" data-enter="4">
        <section>
          <SectionHeading meta="Recorded every 15 minutes · dashed line is the previous close">
            Price &amp; Volume
          </SectionHeading>
          <IntradayChart points={activity.intraday} up={up} previousClose={ticker.price - ticker.change} />
        </section>

        <UpcomingEvents events={activity.events} />
      </div>

      {/* Full width and one column, deliberately. Two columns were tried on
          paper and cannot work: the rail is drawn per row as "a segment unless
          this is the last entry", and CSS decides where a multi-column list
          breaks, so the rail would run off the bottom of the first column into
          nothing. A grid instead of columns reverses the reading order — in
          row-major flow the sequence goes across while the rail goes down. */}
      <ActivityTimeline entries={activity.timeline} />

      <TodaysStory activity={activity} />
    </div>
  );
}
