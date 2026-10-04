import { NewsThumbnail } from "@/components/news-thumbnail";
import type { NewsItem } from "@/lib/queries-news";

function timeAgo(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 60) return `${Math.max(minutes, 1)}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function NewsList({
  items,
  emptyMessage = "No articles in this category yet.",
}: {
  items: NewsItem[];
  emptyMessage?: string;
}) {
  if (!items.length) {
    return <p className="panel px-5 py-10 text-sm text-muted" data-enter="2">{emptyMessage}</p>;
  }

  return (
    // Two columns from 1130px, and the number is the row's own arithmetic
    // rather than a stock breakpoint. A row is a 96px plate, a 16px gap and
    // text; at 45 characters the text needs about 340px, so a column needs
    // ~452px and a pair of them ~928 plus the 48px shell. 1130 is the
    // breakpoint Home already derives, and it clears that with room.
    //
    // The reason is measured emptiness: at 1470 the row ran 1420px while its
    // content stopped at ~780, leaving 491px — 35% of every row, sixty rows
    // deep, about 4.1 million px of empty panel. Capping the summary to a
    // readable measure in the pass before this one made it worse, not better,
    // which is what settled the column count: the width has to be spent, not
    // reclaimed.
    //
    // Dividers are drawn per cell rather than with a gap: the panel is glass,
    // and a grid gap showing a hairline-coloured background under it would
    // need every row to become an opaque plate, which is the One Translucent
    // Layer Rule broken for the sake of a line.
    <ul className="panel overflow-hidden min-[1130px]:grid min-[1130px]:grid-cols-2 min-[1130px]:[&>li:nth-child(odd)]:border-r min-[1130px]:[&>li:nth-last-child(-n+2)]:border-b-0">
      {items.map((item, i) => {
        const symbol = item.relatedSymbols[0] ?? null;

        return (
        <li
          key={item.id}
          className="flex gap-4 border-b border-hairline p-5 last:border-0 hover:bg-surface-soft"
          // The articles arrive on the panel one at a time in reading order
          // (globals.css, "The page arriving"), a beat behind the filters: the
          // first two, then the rest of the first screen together. Past the eighth they are below the
          // screen at every designed size, so they are simply there.
          data-enter={i < 8 ? String(Math.min(i + 2, 4)) : undefined}
        >
          <NewsThumbnail symbol={symbol} />

          {/* The row's meta moves into its own right-hand column from sm up.
              With the summary capped at a 68ch reading measure, a 1500px row
              put the time and tickers under the text and left the whole right
              third of every row empty — the row was one column in a container
              built for two. Below sm the column collapses back under the text
              in source order, so there is only one copy of the markup. */}
          {/* The meta column returns under the text once the list is two
              columns wide: 176px of fixed meta beside a 45-character measure
              needs ~650px, which a half-width column does not have until
              1400px. Stacked, the same row is comfortable from 1130.

              `min-[640px]:` rather than `sm:`, and the two are not
              interchangeable here. Tailwind emits arbitrary-variant rules
              before the named breakpoints, so `sm:flex-row` won at every width
              and the two-column rows kept a 176px meta column beside a 187px
              measure — 28 characters a line. Stating both tiers in the same
              arbitrary form is what makes the later one win. */}
          <div className="flex min-w-0 flex-1 flex-col gap-3 min-[640px]:flex-row min-[640px]:items-start min-[640px]:justify-between min-[640px]:gap-6 min-[1130px]:flex-col min-[1130px]:gap-3">
            <div className="min-w-0">
              {/* The headline is the row's one reason to exist and it was set at
                  the same 14px as the summary below it, so a list of twenty read
                  as one continuous block of text.

                  It is an h2 because the page's whole content is headlines and
                  none of them were headings: the served markup carried one h1
                  and zero h2-h6, so a screen reader's heading list on a page of
                  60 articles held exactly one entry ("News") and the only way
                  through was to arrow the whole list linearly. The h2 is purely
                  structural — every type class stays on the anchor. */}
              <h2>
                <a
                  href={item.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  // py-1 on an inline element paints and receives pointer
                  // events without entering the line box, so the target grows
                  // from 22px to 30px and nothing on the row moves. A
                  // single-line headline was the failing case: WCAG 2.2 SC
                  // 2.5.8 asks 24, and the inline-link exception is arguable
                  // for a headline that is the row's only reason to exist.
                  className="py-1 font-serif text-base font-semibold leading-snug text-ink transition-colors hover:text-primary"
                >
                  {item.headline}
                  {/* Every headline leaves the app for the publisher, and
                      nothing said so. Sixty links that silently open a new tab
                      is a lot of unexplained context switching. */}
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
              </h2>

              {/* Always the AI paraphrase, never the source's own snippet.
                  max-w caps the measure — unconstrained, this ran past 110
                  characters per line at the widest supported viewport. text-sm
                  on the same element is load-bearing: `ch` resolves against the
                  element's own font size.

                  53ch rather than 68, because "roughly a character" is not what
                  `ch` measures: at 14px Inter these summaries average 6.85px a
                  character against an 8.84px "0", so 68ch rendered 88
                  characters. 53 renders 68. */}
              {item.summary && (
                <p className="mt-1.5 max-w-[53ch] text-sm leading-relaxed text-body">
                  {item.summary}
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 min-[640px]:w-44 min-[640px]:shrink-0 min-[640px]:justify-end min-[1130px]:w-auto min-[1130px]:justify-start">
              {/* Mono + tabular, per the Mono Numerals Rule. This was the one
                  timestamp in the product set in Inter; the timeline renders the
                  same class of value in mono.

                  <time> carries the absolute instant that "3h ago" is relative
                  to. The relative string is computed on the server at render,
                  so a tab left open overnight shows a frozen figure — the
                  dateTime attribute is the only thing on the row that stays
                  true, and it is what assistive tech and the browser read. */}
              <time
                dateTime={item.publishedAt}
                className="font-mono text-xs tabular-nums text-muted"
              >
                {timeAgo(item.publishedAt)}
              </time>

              {/* Tickers come from Finnhub's own field, never AI-inferred. */}
              {item.relatedSymbols.slice(0, 4).map((ticker) => (
                <span
                  key={ticker}
                  className="rounded-full bg-surface-strong px-2.5 py-0.5 text-micro font-semibold text-body"
                >
                  {ticker}
                </span>
              ))}
            </div>
          </div>
        </li>
        );
      })}
    </ul>
  );
}
