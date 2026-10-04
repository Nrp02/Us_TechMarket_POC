import type { ReactNode } from "react";

// Every section on every page opened with `text-lg font-semibold text-ink` and
// an ad-hoc right-hand note, repeated in eight components with three different
// alignment choices between them. After the one display heading the page had no
// further steps in its ramp, so eight sections all read as the same rank.
//
// One step up in size and a hairline running from the heading to the meta: the
// rule is what makes a section start read as a start, and it costs no vertical
// space because it sits on the baseline the two ends already share.

export function SectionHeading({
  children,
  meta,
  id,
  enter,
}: {
  children: ReactNode;
  meta?: ReactNode;
  id?: string;
  // Its beat in the page's arrival (globals.css, "The page arriving").
  enter?: string;
}) {
  return (
    // flex-wrap, because both text ends are shrink-0 and the row therefore has
    // a hard minimum: heading + gap + the rule's own min-w-4 + gap + meta. In a
    // half-width column that minimum can exceed the space available — measured
    // at 1024px, "From the earnings calendar" beside "Upcoming Events" pushed
    // the page 9px past the viewport, which is the one thing the Scrolling
    // Island Rule says must never happen. Neither end may shrink (a truncated
    // heading and a two-line meta on a baseline row both read as broken), so
    // the row wraps instead and the meta drops to its own line. The rule has
    // flex-basis 0, so it contributes only its min-width to the fit
    // calculation and expands to fill line one once the meta has moved off it.
    // min-h is the height of the tallest thing this row can hold: a
    // `panel-control` pill, which is 20px of line box plus 8px of padding
    // either side plus its 1px borders. It is here because the two sections
    // that sit side by side on Home carry different metas — the watchlist has
    // the picker button, Top Movers has nothing — and without a floor the two
    // heading rows measured 38px and 28px, so the two panels beneath them
    // started 10px apart. Measured, not guessed: 558 against 548.
    //
    // A row with no meta simply carries 10px of slack under its heading, which
    // costs nothing and buys every section on every page the same start.
    <div className="mb-4 flex min-h-[38px] flex-wrap items-baseline gap-4" data-enter={enter}>
      <h2
        id={id}
        className="shrink-0 text-xl font-semibold tracking-tight text-ink"
      >
        {children}
      </h2>
      <span className="h-px min-w-4 flex-1 bg-hairline" aria-hidden />
      {/* self-center, so a control in this slot does not drag the heading.
          `items-baseline` aligns every participant on its own text baseline,
          and a pill button's baseline sits 8px of padding lower than a bare
          h2's — which pushed the watchlist heading 3px below Top Movers'. A
          button is an object, not a line of type; it has no business being on
          the row's baseline. Text metas are unaffected at this size. */}
      {meta && <span className="shrink-0 self-center text-xs text-muted">{meta}</span>}
    </div>
  );
}
