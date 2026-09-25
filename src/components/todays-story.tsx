import type { ReactNode } from "react";

import { ComparisonBars, RangeBar, YtdChart } from "@/components/story-charts";
import { formatEtTime } from "@/lib/format";
import type { Activity } from "@/lib/queries";

// The page's centrepiece, replacing the old 3-field AI Daily Summary. Same
// elevated surface and corner wash as the card it replaces (see
// daily-summary-card.tsx in git history for the measurements behind both) —
// only the content inside changed, from one narrative paragraph plus bullets
// to the 8-section Today's Story.
//
// Rendering this makes no AI call: the narrative was written once by the
// Groq end-of-day job (story-generation.ts) and stored. Two visitors reading
// the same stock cost nothing between them.

function StorySection({
  label,
  text,
  chart,
}: {
  label: string;
  text: string;
  chart?: ReactNode;
}) {
  const body = (
    <p className="text-pretty font-serif text-base leading-relaxed text-ink">{text}</p>
  );

  return (
    <div>
      <h3 className="text-micro font-semibold uppercase tracking-wide text-muted">{label}</h3>
      {chart ? (
        <div className="mt-2 grid gap-4 min-[600px]:grid-cols-[minmax(0,1fr)_200px] min-[600px]:items-center min-[600px]:gap-6">
          {body}
          <div className="min-w-0">{chart}</div>
        </div>
      ) : (
        <div className="mt-2">{body}</div>
      )}
    </div>
  );
}

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

  return (
    <section className="panel-raised relative isolate overflow-hidden p-6 sm:p-8">
      {/* Same wash as the card this replaces — the light in the room falling
          on the product's most important panel, not the accent used as
          decoration. See daily-summary-card.tsx's history for why
          --color-weather rather than --color-primary. */}
      <span
        aria-hidden
        className="pointer-events-none absolute -left-24 -top-32 -z-10 size-96 rounded-full opacity-[0.18]"
        style={{
          background:
            "radial-gradient(closest-side, var(--color-weather), transparent)",
        }}
      />

      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xl font-semibold tracking-tight text-ink">Today&apos;s Story</h2>
        {story && (
          <span className="font-mono text-xs tabular-nums text-muted">
            Written after the close · {formatEtTime(story.generatedAt)}
          </span>
        )}
      </div>

      {!story ? (
        <p className="mt-4 text-sm text-body">
          No story for this session yet. Today&apos;s Story is written once per
          stock after the US market closes.
        </p>
      ) : (
        <>
          <div className="mt-5 flex flex-col gap-6">
            {/* Headline: the story's own lede, not labeled like the sections
                below it — it reads as the opening line of the briefing. */}
            <div>
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

            <StorySection
              label="Sector, Market & Peers"
              text={story.sections.comparison}
              chart={
                <ComparisonBars
                  stock={ticker.changePercent}
                  sector={sector?.changePercent ?? null}
                  market={market?.changePercent ?? null}
                  peerAverage={peers.peerAveragePercent}
                />
              }
            />

            <StorySection
              label="Company-Specific or Market-Wide"
              text={story.sections.classification}
            />

            <StorySection
              label="Unusual vs. History"
              text={story.sections.unusualness}
              chart={rangeChart(dailyCloses, ticker.price)}
            />

            <StorySection label="Why It Moved" text={story.sections.explanation} />

            <StorySection label="Business & Fundamentals" text={story.sections.fundamentals} />

            <StorySection
              label="Peer & Sector Relation"
              text={story.sections.peerSectorRelation}
            />

            <StorySection
              label="Year-to-Date"
              text={story.sections.ytdTakeaway}
              chart={ytdChart(dailyCloses)}
            />
          </div>

          <div className="mt-6 border-t border-hairline pt-4">
            <p className="max-w-[62ch] text-xs leading-relaxed text-muted">
              Written by AI from {ticker.symbol}&apos;s recorded prices, volume,
              peers, fundamentals, news and calendar for this session.
              &quot;Why It Moved&quot; and &quot;Peer &amp; Sector Relation&quot;
              may infer a plausible, data-grounded connection even where no
              source states it explicitly — every other section states only
              what the data shows. Nothing here predicts future prices or
              offers investment advice.
            </p>
          </div>
        </>
      )}
    </section>
  );
}
