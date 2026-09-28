import { SectionHeading } from "@/components/section-heading";
import { formatEtTime } from "@/lib/format";
import type { DailySummary } from "@/lib/queries";

// The AI Daily Summary — restored as its own section, separate from Today's
// Story further down the page. The two answer different questions: this
// card is a plain account of the session ("What Happened Today"); Today's
// Story's own headline section is the one that states, in one paragraph,
// what about the day is actually worth a reader's attention. Written once
// by the end-of-day Gemini job (daily-summary.ts) and stored — rendering
// this makes no AI call, so two visitors reading the same stock cost
// nothing between them.
//
// Wrapped in the same SectionHeading every other block on this page uses
// (flattened to independent top-level sections — see CLAUDE.md), rather than
// carrying its own ad-hoc heading as it did before Today's Story replaced it.

export function DailySummaryCard({
  summary,
  symbol,
}: {
  summary: DailySummary | null;
  symbol: string;
}) {
  return (
    <section>
      <SectionHeading
        meta={summary ? `Written after the close · ${formatEtTime(summary.generatedAt)}` : undefined}
      >
        What Happened Today
      </SectionHeading>

      {summary ? (
        // panel, not panel-raised. It was raised too, beside Today's Story's
        // "Worth Your Attention Today" card, which put two raised elements on
        // one page and said nothing (The One Raised Element Rule). The raised
        // rank, and the Weather Blue corner wash that goes with it, belong to
        // the card whose job is to single out what deserves attention.
        <div className="panel p-6 sm:p-8">
          <div className="grid gap-6 text-lg min-[1050px]:grid-cols-[minmax(0,1fr)_minmax(0,30rem)] min-[1050px]:gap-10">
            <p className="lede text-pretty font-serif text-lg leading-[1.55] text-ink">
              {summary.narrative}
            </p>

            {summary.bullets.length > 0 && (
              <ul className="flex max-w-[34rem] flex-col gap-3 border-t border-hairline pt-5 min-[1050px]:justify-self-end min-[1050px]:border-l min-[1050px]:border-t-0 min-[1050px]:pl-10 min-[1050px]:pt-0">
                {summary.bullets.map((bullet, i) => (
                  // Indexed because the model can return two identical
                  // bullets and this list is static — never reordered, never
                  // filtered.
                  <li key={i} className="flex gap-3 text-sm text-body">
                    <span
                      className="mt-2 size-1.5 shrink-0 rounded-full bg-primary"
                      aria-hidden
                    />
                    <span className="leading-relaxed">{bullet}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : (
        // Explicit about what this section is for even before it has
        // content, rather than a bare "no data" line — a visitor mid-session
        // should understand this is where the day's highlights will land,
        // not conclude the feature is broken or missing.
        <p className="panel p-5 text-sm text-body">
          What Happened Today is written once per stock after the US
          market closes, highlighting what most deserves a reader&apos;s
          attention from {symbol}&apos;s session. Nothing has been generated
          for this session yet.
        </p>
      )}
    </section>
  );
}
