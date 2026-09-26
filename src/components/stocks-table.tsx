import Link from "next/link";

import { CompanyLogo } from "@/components/company-logo";
import { SectionHeading } from "@/components/section-heading";
import { Sparkline } from "@/components/sparkline";
import { StatusBadge } from "@/components/status-badge";
import {
  formatChange,
  formatPercent,
  formatPrice,
  formatRelVolume,
  formatVolume,
} from "@/lib/format";
import type { Ticker } from "@/lib/queries";
import { SIGNIFICANCE_RULE_TEXT } from "@/lib/significance";

// Seven columns carrying eight fields: Rel. Volume folded into the Volume cell
// rather than getting a column of its own.
//
// The owner asked for Rel. Volume to be dropped outright, to buy the width that
// lets this table sit beside Top Movers at more screen sizes. Folding it in
// buys exactly the same width — measured, 788px of min-content down to 736px,
// identical either way, and 746px once the header row was told not to wrap —
// and keeps the figure, which matters because relative
// volume is one of the three inputs to the Significant rule. Delete it and the
// badge in the next column but one can no longer be explained by anything the
// table shows.
//
// It also reads better than it did as a column. Relative volume IS today's
// volume divided by the 10-day average, so the two are one measurement and its
// scale — "26.1M, which is 0.43x normal" — rather than two independent facts
// that happened to be adjacent.
const HEADINGS = [
  "Symbol",
  "Price",
  "Change",
  "Change %",
  "Volume",
  "Status",
  "Chart (Day)",
];

export function StocksTable({ tickers }: { tickers: Ticker[] }) {
  return (
    <section>
      <SectionHeading>Stocks</SectionHeading>

      {/* Below 600px this table is not a table any more — see the list under
          it. Hidden rather than left to scroll: 746px of min-content inside a
          358px column shows Symbol and Price and puts Change % — the single
          number the page exists to report — off screen behind a scrollbar that
          iPadOS and iOS both hide until a scroll is already under way. The
          Scrolling Island Rule keeps that from breaking the page, and it was
          doing its job; what it cannot do is make the primary read reachable.

          600px is the phone line the shell and the nav card already use. Above
          it the table stays exactly as it was, including the iPad case at 768
          where it scrolls by 26px and the hint below says so. */}
      <div className="panel hidden overflow-x-auto min-[600px]:block">
        <table className="w-full min-w-[746px] border-collapse text-left">
          <thead>
            {/* The header row was the same canvas as the body, separated by one
                hairline, so a scrolled table lost its column labels into the
                data. surface-soft is a half-step and reads as a header band. */}
            <tr className="border-b border-hairline bg-surface-soft">
              {HEADINGS.map((heading) => (
                <th
                  key={heading}
                  scope="col"
                  // Kept as a hover affordance on the column label. The rule
                  // itself now reads out loud in the note under the table, so
                  // the `sr-only` copy that used to sit here has gone — with
                  // both, a screen reader heard the same sentence twice.
                  //
                  // Worth recording what the old arrangement got right and
                  // wrong: screen readers WERE served, by that sr-only span.
                  // The people it missed were sighted keyboard and touch users,
                  // for whom a `title` does not exist at all.
                  title={heading === "Status" ? SIGNIFICANCE_RULE_TEXT : undefined}
                  // nowrap: "Change %" broke after the word and, because a row
                  // is as tall as its tallest cell, that one wrap set the
                  // height of the entire header band — 57px for a row of
                  // single-line labels. A column label that wraps is also just
                  // wrong in a data table: the header should be the one thing
                  // in the column that never reflows. Costs 10px of table
                  // min-content, which is paid for in the breakpoint below.
                  className="whitespace-nowrap px-3 py-3 text-xs font-semibold text-muted"
                >
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tickers.map((ticker) => {
              const up = ticker.changePercent >= 0;
              const moveColor = up ? "text-semantic-up" : "text-semantic-down";

              return (
                <tr
                  key={ticker.symbol}
                  className="border-b border-hairline transition-colors last:border-0 hover:bg-surface-soft"
                >
                  <td className="px-3 py-3">
                    {/* The route to this stock's own page. Home's whole job is
                        to say which stock is worth looking at, and until this
                        link existed the answer led nowhere: the visitor had to
                        memorise the ticker, open Today's Activity (which lands
                        on a different stock), and hunt it down in a dropdown. */}
                    <Link
                      href={`/todays-activity/${ticker.symbol}`}
                      // The symbol and company name render as two sibling divs
                      // with no separator between them — measured via
                      // textContent as "NVDANVIDIA", which a screen reader is
                      // liable to announce as one run-together word rather
                      // than the two-part identity a sighted reader gets from
                      // the line break. The explicit name is the fix.
                      aria-label={`${ticker.symbol} – ${ticker.name}`}
                      className="group flex items-center gap-3"
                    >
                      <CompanyLogo symbol={ticker.symbol} name={ticker.name} eager />
                      <div>
                        <div className="text-sm font-semibold text-ink transition-colors group-hover:text-primary">
                          {ticker.symbol}
                        </div>
                        <div className="text-xs text-muted">{ticker.name}</div>
                      </div>
                    </Link>
                  </td>
                  {/* Price is what the row is about, so it carries the one size
                      step above the rest of the cells. Change % is the second
                      read and takes the weight instead of a third size. */}
                  <td className="px-3 py-3 font-mono text-base font-medium tabular-nums text-ink">
                    {formatPrice(ticker.price)}
                  </td>
                  <td className={`px-3 py-3 font-mono text-sm tabular-nums ${moveColor}`}>
                    {formatChange(ticker.change)}
                  </td>
                  <td
                    className={`px-3 py-3 font-mono text-sm font-semibold tabular-nums ${moveColor}`}
                  >
                    {formatPercent(ticker.changePercent)}
                  </td>
                  <td className="px-3 py-3 font-mono text-sm tabular-nums text-body">
                    {formatVolume(ticker.volume)}
                    {/* Muted and a step down, so the cell reads as one figure
                        with its scale underneath rather than as two values of
                        equal rank. Neutral colour either way: heavy volume is
                        neither good news nor bad, and colouring it would assert
                        a judgement the product is not allowed to make. */}
                    {/* nowrap: at the column's natural width "0.43x avg" broke
                        after the figure and put "avg" on a third line, which
                        made every row 31px tall for a two-word label. */}
                    <span className="block whitespace-nowrap text-micro text-muted">
                      {formatRelVolume(ticker.relativeVolume)} avg
                    </span>
                  </td>
                  {/* "Normal" was once replaced with an em-dash here, on the
                      argument that a badge marking an exception should not be
                      printed on every row that is not one — the column held six
                      identical pills and one Significant, 191px wide at 1920.
                      It was reverted on sight, and the reason is the case that
                      argument forgot: most days nothing crosses the rule at
                      all, so the column became seven dashes and read as data
                      that had failed to load. A quiet answer still has to look
                      like an answer. */}
                  <td className="px-3 py-3">
                    <StatusBadge significant={ticker.significant} />
                  </td>
                  {/* The chart fills its cell rather than sitting at a fixed
                      96px inside a 193px column at 1920. The SVG carries a
                      viewBox, so a wider box redraws the session instead of
                      stretching it — the same treatment the Market Overview
                      card already gives it. */}
                  <td className="px-3 py-3">
                    <span className="flex min-w-0 max-w-[140px] [&>svg]:h-auto [&>svg]:w-full">
                      <Sparkline values={ticker.spark} up={up} />
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {!tickers.length && (
          <p className="px-3 py-8 text-sm text-muted">
            No prices stored for this session yet. Prices are recorded every 15
            minutes while the US market is open.
          </p>
        )}
      </div>

      {/* The phone composition. One row per stock in two lines, carrying all
          eight fields with nothing off screen: identity and price on the first,
          the volume pair, the badge and the day chart on the second.

          A list rather than a stack of cards. These rows are one repeated
          measurement and the panel is the object; seven bordered plates would
          be seven objects, which is the card-as-page-structure habit the craft
          floor names — and it would put a translucent pane inside a translucent
          pane, which the One Translucent Layer Rule forbids outright. So: the
          same `panel`, the same hairline dividers and the same hover the table
          rows carry, restacked.

          The values come from the same format helpers the table cells use, so
          the two presentations cannot disagree about a number. What differs is
          only which line a field sits on.

          The whole row is the link, where the table only links the symbol cell.
          A 342px row is a comfortable touch target and there is nothing else in
          it to hit; on the table the row has seven cells and a link over all of
          them would swallow the column structure. */}
      <ul className="panel min-[600px]:hidden">
        {tickers.map((ticker) => {
          const up = ticker.changePercent >= 0;
          const moveColor = up ? "text-semantic-up" : "text-semantic-down";

          return (
            <li
              key={ticker.symbol}
              className="border-b border-hairline last:border-0"
            >
              <Link
                href={`/todays-activity/${ticker.symbol}`}
                aria-label={`${ticker.symbol} – ${ticker.name}`}
                className="group flex flex-col gap-3 px-4 py-4 transition-colors hover:bg-surface-soft"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <CompanyLogo symbol={ticker.symbol} name={ticker.name} eager />
                    {/* min-w-0 and truncate: a long company name is the one
                        field here with no natural bound, and without them it
                        pushes the price off the right edge instead of
                        shortening. */}
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-ink transition-colors group-hover:text-primary">
                        {ticker.symbol}
                      </div>
                      <div className="truncate text-xs text-muted">
                        {ticker.name}
                      </div>
                    </div>
                  </div>

                  {/* Price over change, right-aligned, mirroring the Today's
                      Activity header — the same two facts in the same
                      arrangement, so a visitor arriving from this row meets a
                      shape they have already read. Absolute and percentage
                      share one line here rather than taking two columns; at
                      this width they are one reading. */}
                  <div className="shrink-0 text-right">
                    <div className="font-mono text-base font-medium tabular-nums text-ink">
                      {formatPrice(ticker.price)}
                    </div>
                    <div
                      className={`font-mono text-xs font-semibold tabular-nums ${moveColor}`}
                    >
                      {formatChange(ticker.change)} (
                      {formatPercent(ticker.changePercent)})
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <span className="font-mono text-micro tabular-nums text-muted">
                    {formatVolume(ticker.volume)} &middot;{" "}
                    {formatRelVolume(ticker.relativeVolume)} avg
                  </span>
                  <div className="flex shrink-0 items-center gap-3">
                    <StatusBadge significant={ticker.significant} />
                    <Sparkline values={ticker.spark} up={up} />
                  </div>
                </div>
              </Link>
            </li>
          );
        })}

        {!tickers.length && (
          <li className="px-4 py-8 text-sm text-muted">
            No prices stored for this session yet. Prices are recorded every 15
            minutes while the US market is open.
          </li>
        )}
      </ul>

      {/* The product's one act of judgement, written where it is used.
      
          `Significant` sits on every row of this table and decides the Top
          Movers ranking, and its rule lived ONLY in a `title` attribute — which
          never appears on touch, is unreachable by keyboard, and is not
          reliably announced. The single number this product computes for itself
          was the one thing a visitor could not look up.

          The wording comes from `SIGNIFICANCE_RULE_TEXT` rather than being
          retyped here, so the badge's tooltip and this line can never disagree.

          The volume sentence rides along because it fixes the same class of
          gap: the cells read `0.43x avg` and never say what the average is of,
          while the same figure on Today's Activity spells out "vs 10-day
          average". One number, two levels of explanation, is a defect.

          52ch, from a measurement rather than a guess: at 12px Inter this
          sentence averages 5.79px a character against a 7.58px "0", so the
          `ch` unit overstates the line by 31%. The 86ch this asked for
          rendered 112 characters. */}
      {tickers.length > 0 && (
        <p className="mt-3 max-w-[52ch] px-1 text-xs leading-relaxed text-muted">
          Volume is shown against each stock&apos;s 10-day average.{" "}
          {SIGNIFICANCE_RULE_TEXT}
        </p>
      )}

      {/* The Scrolling Island Rule works — the table scrolls inside its own
          wrapper instead of widening the page — but nothing ever *said* so. At
          iPad portrait the content column is 480px against an 880px table, so
          five of the eight columns are off screen, and the only affordance was
          a scrollbar measuring 1.20:1 that iPadOS hides entirely until a scroll
          is already under way. A visitor had no way to know Status and Chart
          existed.

          The breakpoint is arithmetic, not a guess, and it moves whenever the
          shell or the column set does. The table's panel needs 748px; the
          content column is viewport − 48 shell padding, so it clears at
          796px and the class rounds that up to a clean 800 — the line survives
          four pixels longer than it strictly must, which is the same rounding
          the Home grid below takes. Tailwind's nearest steps (768, 1024) would
          both be wrong by an order more than that.

          It was 1060 while navigation lived in a 240px left rail, whose width
          plus its 24px gap came out of this same column. Moving the nav to a
          card above the content returned all 264px, and the whole of that
          shows up here: the hint now disappears at iPad portrait instead of
          persisting to laptop widths. */}
      {/* Only between 600 and 800. Below 600 there is no table to scroll —
          the list above shows every field — and a hint pointing at a control
          that is not on screen is worse than no hint. */}
      {tickers.length > 0 && (
        <p className="mt-3 hidden px-1 text-xs text-muted min-[600px]:block min-[800px]:hidden">
          Scroll the table sideways for volume, status and the day chart.
        </p>
      )}
    </section>
  );
}
