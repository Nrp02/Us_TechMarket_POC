import { SectionHeading } from "@/components/section-heading";
import { formatEtTime } from "@/lib/format";
import type { MarketStory as MarketStoryData } from "@/lib/queries";

// The Market page's centrepiece — the whole-market counterpart to
// todays-story.tsx, same visual pattern exactly: full-width stacked
// sections, first one elevated with the corner-wash gradient, plain `.panel`
// cards for the rest, trailing AI-disclosure paragraph.
//
// Rendering this makes no AI call: the narrative was written once by the
// Groq end-of-day job (market-story-generation.ts) and stored. Every
// visitor reading the Market page on the same trading day costs nothing
// between them.

function SectionCard({ text }: { text: string }) {
  return (
    <div className="panel p-5 sm:p-6">
      <p className="text-pretty font-serif text-base leading-relaxed text-ink">{text}</p>
    </div>
  );
}

export function MarketStory({ story }: { story: MarketStoryData | null }) {
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
        <SectionCard text={story.sections.standoutMovers} />
      </section>

      <section>
        <SectionHeading>Sector Leadership</SectionHeading>
        <SectionCard text={story.sections.sectorLeadership} />
      </section>

      <section>
        <SectionHeading>Breadth</SectionHeading>
        <SectionCard text={story.sections.breadth} />
      </section>

      <section>
        <SectionHeading>Market-Relevant News</SectionHeading>
        <SectionCard text={story.sections.marketEvents} />
      </section>

      <section>
        <SectionHeading>Macro Context</SectionHeading>
        <SectionCard text={story.sections.macroContext} />
      </section>

      <section>
        <SectionHeading>Volatility &amp; Context</SectionHeading>
        <SectionCard text={story.sections.volatilityContext} />
      </section>

      <section>
        <SectionHeading>Today&apos;s Market Story</SectionHeading>
        <SectionCard text={story.sections.closingSynthesis} />
        <p className="mt-4 max-w-[62ch] text-xs leading-relaxed text-muted">
          Written by AI from today&apos;s breadth, sector, index/proxy,
          macro and news figures. Every section may infer a plausible,
          data-grounded connection between them, but only from what&apos;s
          shown here — never an outside fact, cause, or event. Nothing here
          predicts future prices or offers investment advice.
        </p>
      </section>
    </>
  );
}
