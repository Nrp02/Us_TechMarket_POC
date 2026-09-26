import { SectionHeading } from "@/components/section-heading";
import { formatEtTime } from "@/lib/format";
import type { DailySummary } from "@/lib/queries";

// The AI Daily Summary — restored as its own section, separate from Today's
// Story further down the page. The two answer different questions: Today's
// Story's "What Happened Today" is a plain account of the session; this card
// is the one place on the page that states, in one paragraph, what about the
// day is actually worth a reader's attention. Written once by the end-of-day
// Gemini job (daily-summary.ts) and stored — rendering this makes no AI call,
// so two visitors reading the same stock cost nothing between them.
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
        Worth Your Attention Today
      </SectionHeading>

      {summary ? (
        // panel-raised, not panel: this is the one other section on the page
        // (besides Today's Story's own headline) that sits a full elevation
        // step above its neighbours, which is why it carries the same corner
        // wash. `isolate` lets the wash sit at -z-10 behind this section's own
        // text but in front of the page, rather than disappearing under the
        // backdrop.
        <div className="panel-raised relative isolate overflow-hidden p-6 sm:p-8">
          <span
            aria-hidden
            className="pointer-events-none absolute -left-24 -top-32 -z-10 size-96 rounded-full opacity-[0.18]"
            style={{
              background:
                "radial-gradient(closest-side, var(--color-weather), transparent)",
            }}
          />

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

          <div className="mt-6 border-t border-hairline pt-4">
            <p className="max-w-[52ch] text-xs leading-relaxed text-muted">
              Written by AI from {symbol}&apos;s recorded prices, volume, news
              and calendar for this session. It describes what happened — not
              why, and not what happens next. Not investment advice.
            </p>
          </div>
        </div>
      ) : (
        // Explicit about what this section is for even before it has
        // content, rather than a bare "no data" line — a visitor mid-session
        // should understand this is where the day's highlights will land,
        // not conclude the feature is broken or missing.
        <p className="panel p-5 text-sm text-body">
          Worth Your Attention Today is written once per stock after the US
          market closes, highlighting what most deserves a reader&apos;s
          attention from {symbol}&apos;s session. Nothing has been generated
          for this session yet.
        </p>
      )}
    </section>
  );
}
