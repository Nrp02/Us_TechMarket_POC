import { SectionHeading } from "@/components/section-heading";
import { formatEtTime } from "@/lib/format";
import type { TimelineEntry } from "@/lib/queries";

// Rebuilt from stored snapshots and news every 15 minutes during the session
// (and once more by the end-of-day job), then read straight from the table
// here — no polling and no live listener in the page itself.

// `news` was bg-semantic-up — the gain colour — so on a stock that fell, every
// headline carried a green dot asserting a direction the article may contradict.
// That is the same failure the rising-arrow market-news icon was cut for. News
// is an event, not a direction, so it takes the neutral accent like the other
// threshold events.
const DOT: Record<TimelineEntry["kind"], string> = {
  market_open: "bg-muted",
  market_close: "bg-muted",
  price_milestone: "bg-primary",
  high_volume: "bg-primary",
  news: "bg-ink",
};

export function ActivityTimeline({ entries }: { entries: TimelineEntry[] }) {
  // Two columns above 1130px, split here rather than in CSS.
  //
  // `columns-2` cannot do this: the rail is drawn per row as "a segment unless
  // this is the last entry", and CSS decides where a multi-column list breaks,
  // so the rail would run off the bottom of the first column into nothing. A
  // two-column grid cannot either — in row-major flow the sequence reads across
  // while the rail runs down, so the two would contradict each other.
  //
  // Splitting the array is what makes the columns read the way a newspaper
  // column does: down the first, then down the second, each with a rail that
  // starts and ends on an entry. The join between them is the one seam CSS has
  // to handle, and it is handled by one connector that is drawn while the
  // columns are stacked and hidden once they sit side by side.
  //
  // The reason is the width. Run as one full-width list the panel measured
  // 1422px with its content stopping at about 750 — half the panel empty down
  // a thousand pixels, which is more emptiness than the 482,608px hole this
  // page was recomposed to remove. A short timeline is left alone: two columns
  // of three rows is an arrangement, not a composition.
  const columns =
    entries.length > 6
      ? [
          entries.slice(0, Math.ceil(entries.length / 2)),
          entries.slice(Math.ceil(entries.length / 2)),
        ]
      : [entries];

  return (
    <section>
      <SectionHeading
        meta={entries.length ? `${entries.length} events` : undefined}
      >
        Timeline
      </SectionHeading>

      {entries.length ? (
        <div className="panel p-5 min-[1130px]:grid min-[1130px]:grid-cols-2 min-[1130px]:gap-x-10">
          {columns.map((col, ci) => (
            <ol key={ci}>
              {col.map((entry, i) => {
                // The last row of the first column keeps its connector while
                // the columns are stacked, so the rail carries across the seam
                // into the second list; side by side it must stop.
                const lastOverall =
                  ci === columns.length - 1 && i === col.length - 1;
                const seam = i === col.length - 1 && !lastOverall;

                return (
                  <li
                    key={`${entry.at}-${entry.kind}-${i}`}
                    className="flex gap-4"
                  >
                    {/* The rail is drawn per row so it stops cleanly at the last one. */}
                    <div className="flex flex-col items-center">
                      {/* The ring is the panel's own surface, so the dot reads as
                          sitting on the rail rather than threaded onto it. */}
                      <span
                        className={`mt-1.5 size-2 shrink-0 rounded-full ring-4 ring-canvas ${DOT[entry.kind]}`}
                        aria-hidden
                      />
                      {!lastOverall && (
                        <span
                          className={`w-px flex-1 bg-hairline ${seam ? "min-[1130px]:hidden" : ""}`}
                          aria-hidden
                        />
                      )}
                    </div>

                    <div className={lastOverall ? "min-w-0" : "min-w-0 pb-5"}>
                      <div className="flex flex-wrap items-baseline gap-x-3">
                        <span className="font-mono text-xs tabular-nums text-muted">
                          {formatEtTime(entry.at)}
                        </span>
                        <span className="text-sm font-semibold text-ink">
                          {entry.label}
                        </span>
                      </div>
                      {entry.detail && (
                        <p className="mt-0.5 max-w-[60ch] text-sm leading-relaxed text-body">
                          {entry.detail}
                        </p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          ))}
        </div>
      ) : (
        <p className="panel px-5 py-10 text-sm text-muted">
          The timeline starts once this session&apos;s first snapshot is
          recorded, and fills in as the day goes on.
        </p>
      )}
    </section>
  );
}
