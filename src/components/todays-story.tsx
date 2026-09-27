import type { ReactNode } from "react";

import { SectionCard } from "@/components/section-card";
import { SectionHeading } from "@/components/section-heading";
import { ComparisonBars, RangeBar, YtdChart } from "@/components/story-charts";
import { formatEtTime } from "@/lib/format";
import type { Activity } from "@/lib/queries";

// The page's centrepiece, replacing the old 3-field AI Daily Summary. Same
// elevated surface and corner wash as the card it replaces (see
// daily-summary-card.tsx in git history for the measurements behind both) —
// only the content inside changed, from one narrative paragraph plus bullets
// to this set of sections.
//
// Each section renders as its own top-level page section (SectionHeading,
// same as Price & Volume / Timeline elsewhere on this page) rather than
// nested under one umbrella "Today's Story" title — see CLAUDE.md for why.
//
// Rendering this makes no AI call: the narrative was written once by the
// Groq end-of-day job (story-generation.ts) and stored. Two visitors reading
// the same stock cost nothing between them.
//
// The text+chart card itself (SectionCard) is shared with Market Story —
// see section-card.tsx.

/** Undefined when there isn't a real trailing range to plot — never a flat line. */
function rangeChart(dailyCloses: Activity["dailyCloses"], currentPrice: number): ReactNode {
  if (dailyCloses.length === 0) return undefined;
  const closes = dailyCloses.map((row) => row.close);
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  if (min === max) return undefined;
  return <RangeBar min={min} max={max} current={currentPrice} />;
}

/** Undefined before there are at least two of this year's closes to draw a line from. */
function ytdChart(dailyCloses: Activity["dailyCloses"]): ReactNode {
  if (dailyCloses.length === 0) return undefined;
  // The array isn't guaranteed sorted, so the year is read off the newest row
  // rather than assumed from the first element.
  const newestYear = dailyCloses
    .reduce((newest, row) => (row.tradingDay > newest.tradingDay ? row : newest))
    .tradingDay.slice(0, 4);
  const ytdCloses = dailyCloses.filter((row) => row.tradingDay.slice(0, 4) === newestYear);
  if (ytdCloses.length < 2) return undefined;
  return <YtdChart closes={ytdCloses} />;
}

export function TodaysStory({ activity }: { activity: Activity }) {
  const { ticker, sector, market, peers, dailyCloses, story } = activity;

  if (!story) {
    return (
      <section>
        <SectionHeading>Worth Your Attention Today</SectionHeading>
        <p className="panel p-5 text-sm text-body">
          No story for this session yet. Today&apos;s Story is written once per
          stock after the US market closes.
        </p>
      </section>
    );
  }

  return (
    <>
      <section>
        <SectionHeading meta={`Written after the close · ${formatEtTime(story.generatedAt)}`}>
          Worth Your Attention Today
        </SectionHeading>
        {/* Its own elevated card, distinct from the plain analytical cards
            below it — same corner wash this page's single panel used to
            carry as a whole. See daily-summary-card.tsx in git history for
            the measurements behind it. */}
        <div className="panel-raised relative isolate overflow-hidden p-6 sm:p-8">
          <span
            aria-hidden
            className="pointer-events-none absolute -left-24 -top-32 -z-10 size-96 rounded-full opacity-[0.18]"
            style={{
              background:
                "radial-gradient(closest-side, var(--color-weather), transparent)",
            }}
          />
          <p className="text-pretty font-serif text-lg leading-[1.5] text-ink">
            {story.sections.headline.text}
          </p>
          {story.sections.headline.news && (
            <p className="mt-2 text-sm text-body">
              <a
                href={story.sections.headline.news.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                {story.sections.headline.news.headline}
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
              {" · "}
              <time
                dateTime={story.sections.headline.news.publishedAt}
                className="font-mono text-xs tabular-nums text-muted"
              >
                {formatEtTime(story.sections.headline.news.publishedAt)}
              </time>
            </p>
          )}
        </div>
      </section>

      <section>
        <SectionHeading>Company or Group Move</SectionHeading>
        <SectionCard text={story.sections.classification} />
      </section>

      <section>
        <SectionHeading>Unusual vs. History</SectionHeading>
        <SectionCard
          text={story.sections.unusualness}
          chart={rangeChart(dailyCloses, ticker.price)}
        />
      </section>

      <section>
        <SectionHeading>Sector, Market &amp; Peers</SectionHeading>
        {/* Merged with the old separate "Peer & Sector Relation" section —
            the two answered the same question ("what should this be
            compared against") and duplicated each other. Display-level
            merge only: the underlying story.sections fields and the Groq
            prompt are unchanged, and the prompt's existing anti-redundancy
            rule already discourages one section from restating another.
            Both paragraphs stack in one left column against one right
            column holding the chart — not per-paragraph pairing, which left
            the second paragraph (no chart of its own) spanning the full
            width and reading as if it had spilled into the chart's lane. */}
        <div className="panel grid gap-6 p-5 sm:p-6 min-[600px]:grid-cols-2 min-[600px]:items-center">
          <div className="flex flex-col gap-4">
            <p className="text-pretty font-serif text-base leading-relaxed text-ink">
              {story.sections.comparison}
            </p>
            <p className="text-pretty font-serif text-base leading-relaxed text-ink">
              {story.sections.peerSectorRelation}
            </p>
          </div>
          <div className="min-w-0">
            <ComparisonBars
              stock={ticker.changePercent}
              sector={sector?.changePercent ?? null}
              market={market?.changePercent ?? null}
              peerAverage={peers.peerAveragePercent}
            />
          </div>
        </div>
      </section>

      <section>
        <SectionHeading>Why It Moved</SectionHeading>
        <SectionCard text={story.sections.explanation} />
      </section>

      <section>
        <SectionHeading>Business &amp; Fundamentals</SectionHeading>
        <SectionCard text={story.sections.fundamentals} />
      </section>

      <section>
        <SectionHeading>Year-to-Date</SectionHeading>
        <SectionCard text={story.sections.ytdTakeaway} chart={ytdChart(dailyCloses)} />
      </section>
    </>
  );
}
