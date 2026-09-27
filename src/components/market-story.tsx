import type { ReactNode } from "react";

import { SectionCard } from "@/components/section-card";
import { SectionHeading } from "@/components/section-heading";
import { RangeBar, RankedBars, YtdChart } from "@/components/story-charts";
import { formatEtTime } from "@/lib/format";
import type { SectorAverage, TopMover } from "@/lib/market-breadth";
import type { MarketStory as MarketStoryData, Ticker } from "@/lib/queries";

// The Market page's centrepiece — the whole-market counterpart to
// todays-story.tsx, same visual pattern exactly: full-width stacked
// sections, first one elevated with the corner-wash gradient, plain `.panel`
// cards for the rest (via the shared SectionCard, see section-card.tsx),
// trailing AI-disclosure paragraph.
//
// Rendering this makes no AI call: the narrative was written once by the
// Groq end-of-day job (market-story-generation.ts) and stored. Every
// visitor reading the Market page on the same trading day costs nothing
// between them.
//
// Four of the seven sections carry a chart, the same ratio and the same
// test todays-story.tsx applies: a chart earns a place only where the
// section's content is one comparable numeric scale, not wherever a number
// exists. Breadth is the one section that could chart (computeBreadth is
// exactly as chart-ready as computeSectorAverages/computeTopMovers) but
// doesn't — SessionDigest already draws the advance/decline bar from the
// same 20 tickers a few hundred pixels above this section, and a second
// identical bar here would read as a repeat rather than a second view.
// Market-Relevant News and Macro Context stay text-only for the same reason
// Today's Story's "Why It Moved" and "Business & Fundamentals" do: a news
// list isn't a chart, and CPI/unemployment/GDP/Fed-funds don't share an
// axis, so putting them on one bar chart would draw a false equivalence
// between four different units.
//
// Every figure any chart below draws is already fetched by page.tsx for
// the Groq prompt itself (topMovers/sectorAverages via computeTopMovers/
// computeSectorAverages, indexDailyCloses via getIndexDailyCloses) — no
// new query, and the same computation the narrative was written from, so a
// chart and the sentence beside it can never disagree about a number.

const VIXY_SYMBOL = "VIXY";
const VIXY_LABEL = "Volatility (VIXY)";
const MARKET_YTD_SYMBOL = "XLK";
const MARKET_YTD_LABEL = "Technology (XLK)";

function SectionText({ text }: { text: string }) {
  return (
    <div className="panel p-5 sm:p-6">
      <p className="text-pretty font-serif text-base leading-relaxed text-ink">{text}</p>
    </div>
  );
}

/**
 * A named wrapper for the two single-instrument charts (VIXY's range,
 * XLK's YTD line) — unlike Standout Movers/Sector Leadership, whose rows
 * carry their own symbol/sector labels, a lone RangeBar or YtdChart draws no
 * label of its own, and the paragraph beside it names the instrument only in
 * passing. Without this, "Volatility & Context" and "Year-to-Date Context"
 * would be the only two charts on the page that don't say what they plot.
 */
function LabeledChart({ label, chart }: { label: string; chart: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-micro font-semibold text-muted">{label}</p>
      {chart}
    </div>
  );
}

function moversRows(topMovers: { gainers: TopMover[]; losers: TopMover[] }) {
  return [...topMovers.gainers, ...topMovers.losers].map((m) => ({
    label: m.symbol,
    value: m.changePercent,
  }));
}

function sectorRows(sectorAverages: SectorAverage[]) {
  return [...sectorAverages]
    .sort((a, b) => b.averageChangePercent - a.averageChangePercent)
    .map((s) => ({ label: s.sector, value: s.averageChangePercent }));
}

/** One aria-label sentence for a RankedBars chart, built from the same rows it draws — never a second, hand-written description that could drift from what's on screen. */
function ariaLabelFor(prefix: string, rows: { label: string; value: number }[]) {
  return `${prefix}: ${rows
    .map((r) => `${r.label} ${r.value >= 0 ? "+" : ""}${r.value.toFixed(2)}%`)
    .join(", ")}.`;
}

/** Undefined when VIXY's own trailing range has no width to plot — never a flat line. */
function volatilityRangeChart(
  indexDailyCloses: { symbol: string; close: number }[],
  vixyPrice: number | undefined,
): ReactNode {
  if (vixyPrice == null) return undefined;
  const closes = indexDailyCloses.filter((row) => row.symbol === VIXY_SYMBOL).map((row) => row.close);
  if (closes.length === 0) return undefined;
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  if (min === max) return undefined;
  return <RangeBar min={min} max={max} current={vixyPrice} />;
}

/** Undefined before there are at least two of this year's XLK closes to draw a line from — same guard todays-story.tsx's ytdChart applies per stock. */
function marketYtdChart(indexDailyCloses: { symbol: string; tradingDay: string; close: number }[]): ReactNode {
  const xlkCloses = indexDailyCloses.filter((row) => row.symbol === MARKET_YTD_SYMBOL);
  if (xlkCloses.length === 0) return undefined;
  const newestYear = xlkCloses
    .reduce((newest, row) => (row.tradingDay > newest.tradingDay ? row : newest))
    .tradingDay.slice(0, 4);
  const ytdCloses = xlkCloses.filter((row) => row.tradingDay.slice(0, 4) === newestYear);
  if (ytdCloses.length < 2) return undefined;
  return <YtdChart closes={ytdCloses} />;
}

export function MarketStory({
  story,
  topMovers,
  sectorAverages,
  indices,
  indexDailyCloses,
}: {
  story: MarketStoryData | null;
  topMovers: { gainers: TopMover[]; losers: TopMover[] };
  sectorAverages: SectorAverage[];
  /** INDEX_SYMBOLS' tickers, for VIXY's current price — same list Market Overview already renders. */
  indices: Ticker[];
  indexDailyCloses: { symbol: string; tradingDay: string; close: number; changePercent: number | null }[];
}) {
  if (!story) {
    return (
      <section>
        <SectionHeading>Today&apos;s Market</SectionHeading>
        <p className="panel p-5 text-sm text-body">
          No Market Story for this session yet. It is written once, after the
          US market closes.
        </p>
      </section>
    );
  }

  const vixyPrice = indices.find((t) => t.symbol === VIXY_SYMBOL)?.price;
  const vixyRange = volatilityRangeChart(indexDailyCloses, vixyPrice);
  const volatilityChart = vixyRange && <LabeledChart label={VIXY_LABEL} chart={vixyRange} />;

  const xlkYtd = marketYtdChart(indexDailyCloses);
  const ytdChart = xlkYtd && <LabeledChart label={MARKET_YTD_LABEL} chart={xlkYtd} />;

  const moverRows = moversRows(topMovers);
  const sectorLeadershipRows = sectorRows(sectorAverages);

  return (
    <>
      <section>
        <SectionHeading meta={`Written after the close · ${formatEtTime(story.generatedAt)}`}>
          Today&apos;s Market
        </SectionHeading>
        <div className="panel-raised relative isolate overflow-hidden p-6 sm:p-8">
          <span
            aria-hidden
            className="pointer-events-none absolute -left-24 -top-32 -z-10 size-96 rounded-full opacity-[0.18]"
            style={{
              background: "radial-gradient(closest-side, var(--color-weather), transparent)",
            }}
          />
          <p className="text-pretty font-serif text-lg leading-[1.5] text-ink">
            {story.sections.overallRead}
          </p>
        </div>
      </section>

      <section>
        <SectionHeading>Standout Movers</SectionHeading>
        <SectionCard
          text={story.sections.standoutMovers}
          chart={
            <RankedBars
              rows={moverRows}
              ariaLabel={ariaLabelFor("Today's biggest movers among the tracked stocks", moverRows)}
            />
          }
        />
      </section>

      <section>
        <SectionHeading>Sector Leadership</SectionHeading>
        <SectionCard
          text={story.sections.sectorLeadership}
          chart={
            <RankedBars
              rows={sectorLeadershipRows}
              ariaLabel={ariaLabelFor("Average percent change by sector", sectorLeadershipRows)}
            />
          }
        />
      </section>

      <section>
        <SectionHeading>Breadth</SectionHeading>
        <SectionText text={story.sections.breadth} />
      </section>

      <section>
        <SectionHeading>Market-Relevant News</SectionHeading>
        <SectionText text={story.sections.marketEvents} />
      </section>

      <section>
        <SectionHeading>Macro Context</SectionHeading>
        <SectionText text={story.sections.macroContext} />
      </section>

      <section>
        <SectionHeading>Volatility &amp; Context</SectionHeading>
        <SectionCard text={story.sections.volatilityContext} chart={volatilityChart} />
      </section>

      <section>
        <SectionHeading>Year-to-Date</SectionHeading>
        <SectionCard text={story.sections.closingSynthesis} chart={ytdChart} />
      </section>
    </>
  );
}
