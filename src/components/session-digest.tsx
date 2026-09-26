import { formatPercent } from "@/lib/format";
import { computeBreadth } from "@/lib/market-breadth";
import type { Ticker } from "@/lib/queries";
import { TOP_20_SYMBOLS, TRACKED_STOCK_SYMBOLS } from "@/lib/symbols";

// The first thing on Home, and now the only thing above Market Overview.
//
// It used to be the right half of a header whose left half was a 52px date.
// That date is in the shell now, so the header had nothing left to balance and
// the digest inherited the slot outright — which is what it was written to be
// in the first place: the one-glance answer to how the session went, before a
// visitor scrolls into any of the detail that explains it.
//
// Horizontal rather than the 352x191 card it was. The panel is the full
// content column now, and a tall narrow card in a wide slot is what left
// ~114,000px2 of the old header empty; laid along the width it reads as one
// line of consequence and costs ~90px of height instead of 191.
//
// The market-open dot and its "Market open / Market closed" label are not here
// any more. They moved into the session marker in the nav card, because they
// are true on every route rather than only on this one — and stating them in
// both places would be the same defect that moved the product's name out of
// this page's heading.
//
// Every figure is counted from tickers the page already fetched — no query, no
// upstream call, and nothing derived that is not a count or a max of stored
// values. Direction is stated in words as well as colour, per the Signed Value
// Rule, so the bar is not the only channel.

export function SessionDigest({ tickers }: { tickers: Ticker[] }) {
  // The shared breadth computation (market-breadth.ts) — this is also what
  // Market Story's breadth section will read (ticket 07), so the figure a
  // visitor sees here and the one the narrative cites can never disagree.
  const significanceTickers = tickers.filter((ticker) => TOP_20_SYMBOLS.includes(ticker.symbol));
  const breadth = computeBreadth(tickers, significanceTickers);
  const advancing = breadth.advancers;
  const declining = breadth.decliners;
  const moved = advancing + declining;
  const significant = breadth.significantCount;

  const widest = tickers.reduce<Ticker | null>(
    (best, t) =>
      !best || Math.abs(t.changePercent) > Math.abs(best.changePercent)
        ? t
        : best,
    null,
  );

  return (
    // flex-wrap with no breakpoint of its own: the four groups have their own
    // natural widths, so the band folds to two rows wherever they stop fitting
    // rather than at a number somebody picked.
    <aside className="panel flex flex-wrap items-center gap-x-10 gap-y-5 px-5 py-4">
      {moved > 0 ? (
        <>
          {/* Breadth across the tracked universe, as one bar rather than two
              numbers. The split is a count of directional price changes, which
              is the one thing the gain/loss pair is allowed to colour. It takes
              the flexible width because it is the only element here that reads
              better the longer it is. */}
          <div className="min-w-[240px] flex-1">
            <div
              className="flex h-2 gap-1 overflow-hidden rounded-full"
              role="img"
              aria-label={`${advancing} of ${tickers.length} tracked stocks advanced, ${declining} declined`}
            >
              <span
                className="bar-advancing rounded-full bg-semantic-up"
                style={{ width: `${(advancing / moved) * 100}%` }}
              />
              <span
                className="bar-declining rounded-full bg-semantic-down"
                style={{ width: `${(declining / moved) * 100}%` }}
              />
            </div>

            <div className="mt-2.5 flex items-baseline justify-between font-mono text-xs tabular-nums">
              <span className="text-semantic-up">{advancing} advancing</span>
              <span className="text-semantic-down">{declining} declining</span>
            </div>
          </div>

          {/* Label and value on one line each, because the band reads across
              rather than down — the justify-between pair this used to be only
              makes sense inside a column with two edges to push against. */}
          <dl className="flex flex-wrap items-baseline gap-x-10 gap-y-2 text-xs">
            <div className="flex items-baseline gap-2">
              <dt className="text-muted">Top 20 · crossed the significance rule</dt>
              <dd className="font-mono tabular-nums text-ink">
                {significant} of {significanceTickers.length}
              </dd>
            </div>
            <div className="flex items-baseline gap-2">
              <dt className="text-muted">Widest move</dt>
              <dd className="font-mono tabular-nums text-ink">
                {widest ? (
                  <>
                    {widest.symbol}{" "}
                    <span
                      className={
                        widest.changePercent >= 0
                          ? "text-semantic-up"
                          : "text-semantic-down"
                      }
                    >
                      {formatPercent(widest.changePercent)}
                    </span>
                  </>
                ) : (
                  "—"
                )}
              </dd>
            </div>
          </dl>
        </>
      ) : (
        <p className="flex-1 text-sm text-muted">
          No prices stored for this session yet.
        </p>
      )}

      {/* The page's provenance sentence, which was the strapline under the old
          heading. It is the same register as every other meta line in the
          product — "Recorded every 15 minutes", "From the earnings calendar" —
          so it belongs at that size, beside the figures it describes, rather
          than at body scale under a title that no longer exists. */}
      <p className="text-xs text-muted">
        Prices recorded every 15 minutes across {TRACKED_STOCK_SYMBOLS.length} tracked stocks.
      </p>
    </aside>
  );
}
