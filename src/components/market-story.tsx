import type { ReactNode } from "react";

import { CheckNotes, SectionCard, StoryDisclosure } from "@/components/section-card";
import { SectionHeading } from "@/components/section-heading";
import { RangeBar, RankedBars, YtdChart } from "@/components/story-charts";
import { formatEtTime } from "@/lib/format";
import type { SectorAverage, TopMover } from "@/lib/market-breadth";
import { ytdSeries } from "@/lib/period-performance";
import type { MarketStory as MarketStoryData, Ticker } from "@/lib/queries";
import { warningsFor } from "@/lib/story-sections";
import { computeRangePosition } from "@/lib/volatility";

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
// computeSectorAverages, indexDailyCloses via getMarketSession) — no
// new query. The range and YTD charts go through the prompt's own functions
// (computeRangePosition, ytdSeries), so they draw what the sentence states.
// The movers and sector bars are recomputed from this render's tickers: the
// same rule as the prompt, over the same session's figures.

const VIXY_SYMBOL = "VIXY";
const VIXY_LABEL = "Volatility (VIXY)";
const MARKET_YTD_SYMBOL = "XLK";
const MARKET_YTD_LABEL = "Technology (XLK)";

function SectionText({ text, warnings }: { text: string; warnings: string[] }) {
  return (
    <div className="panel pane-quiet p-5 sm:p-6">
      <p className="text-pretty font-serif text-base leading-relaxed text-ink">{text}</p>
      <CheckNotes warnings={warnings} />
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

/** Undefined when VIXY's own trailing range has no width to plot — the prompt's range, never a flat line. */
function volatilityRangeChart(
  indexDailyCloses: { symbol: string; close: number }[],
  vixyPrice: number | undefined,
): ReactNode {
  if (vixyPrice == null) return undefined;
  const closes = indexDailyCloses.filter((row) => row.symbol === VIXY_SYMBOL).map((row) => row.close);
  const range = computeRangePosition(vixyPrice, closes);
  if (range.min == null || range.max == null) return undefined;
  return <RangeBar min={range.min} max={range.max} current={vixyPrice} />;
}

/** Undefined before there are two points to draw — the span XLK's YTD figure measures, same as todays-story.tsx. */
function marketYtdChart(
  indexDailyCloses: { symbol: string; tradingDay: string; close: number }[],
  day: string,
  xlkPrice: number | undefined,
): ReactNode {
  if (xlkPrice == null) return undefined;
  const series = ytdSeries(indexDailyCloses.filter((row) => row.symbol === MARKET_YTD_SYMBOL), day, xlkPrice);
  return series.length < 2 ? undefined : <YtdChart closes={series} />;
}

export function MarketStory({
  story,
  topMovers,
  sectorAverages,
  indices,
  indexDailyCloses,
  day,
}: {
  story: MarketStoryData | null;
  topMovers: { gainers: TopMover[]; losers: TopMover[] };
  sectorAverages: SectorAverage[];
  /** INDEX_SYMBOLS' tickers, for VIXY's current price — same list Market Overview already renders. */
  indices: Ticker[];
  indexDailyCloses: { symbol: string; tradingDay: string; close: number; changePercent: number | null }[];
  /** The session the story and the figures describe. */
  day: string;
}) {
  if (!story) {
    return (
      <section>
        <SectionHeading>Today&apos;s Market</SectionHeading>
        <p className="panel pane-quiet p-5 text-sm text-body">
          No Market Story for this session yet. It is written once, after the
          US market closes.
        </p>
      </section>
    );
  }

  const vixyPrice = indices.find((t) => t.symbol === VIXY_SYMBOL)?.price;
  const vixyRange = volatilityRangeChart(indexDailyCloses, vixyPrice);
  const volatilityChart = vixyRange && <LabeledChart label={VIXY_LABEL} chart={vixyRange} />;

  const xlkYtd = marketYtdChart(indexDailyCloses, day, indices.find((t) => t.symbol === MARKET_YTD_SYMBOL)?.price);
  const ytdChart = xlkYtd && <LabeledChart label={MARKET_YTD_LABEL} chart={xlkYtd} />;

  const warn = (key: string) => warningsFor(story.sections.checks, key);
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
          <CheckNotes warnings={warn("overallRead")} />
        </div>
      </section>

      <section>
        <SectionHeading>Standout Movers</SectionHeading>
        <SectionCard
          text={story.sections.standoutMovers}
          warnings={warn("standoutMovers")}
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
          warnings={warn("sectorLeadership")}
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
        <SectionText text={story.sections.breadth} warnings={warn("breadth")} />
      </section>

      <section>
        <SectionHeading>Market-Relevant News</SectionHeading>
        <SectionText text={story.sections.marketEvents} warnings={warn("marketEvents")} />
      </section>

      <section>
        <SectionHeading>Macro Context</SectionHeading>
        <SectionText text={story.sections.macroContext} warnings={warn("macroContext")} />
      </section>

      <section>
        <SectionHeading>Volatility &amp; Context</SectionHeading>
        <SectionCard text={story.sections.volatilityContext} chart={volatilityChart} warnings={warn("volatilityContext")} />
      </section>

      <section>
        <SectionHeading>Year-to-Date</SectionHeading>
        <SectionCard text={story.sections.closingSynthesis} chart={ytdChart} warnings={warn("closingSynthesis")} />
        <StoryDisclosure />
      </section>
    </>
  );
}
