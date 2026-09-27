// The fill gradients every sparkline and the intraday chart paint under their
// price line, defined once for the whole document.
//
// An SVG `url(#id)` reference resolves document-wide, not per-<svg>, so one
// hidden defs block serves the eleven sparklines a Home page renders plus the
// chart on Today's Activity. The alternative — a <defs> inside each sparkline —
// needs a unique id per instance, and these are server components with no
// useId available and no stable key to derive one from.
//
// Two gradients rather than one recoloured by currentColor: SVG gradient stops
// cannot read the element they fill, so a single "session" gradient would need
// a CSS custom property per instance, which is the per-instance problem again.
//
// Three stops, not two. A single stop fading straight to 0 reads thin at the
// small sizes these fills mostly run at — 96x28 in a watchlist row, 140x36 on
// Market Overview — because the transparent two-thirds of the shape carries
// almost no ink. The middle stop holds the fill legible for longer before it
// lets go of the baseline, so the area under the line reads as a body of
// colour rather than a haze clinging to the stroke. Still closes to fully
// transparent by 100%: this is the one place besides the two named washes
// where the session colours are allowed to spread past a line or a token, and
// spreading them across the whole shape at even opacity would read as a flat
// fill rather than as light falling off a line.
export function ChartGradients() {
  return (
    <svg
      aria-hidden
      focusable="false"
      // Not `display: none` — Safari drops referenced gradients out of a
      // display:none subtree. Zero-size and absolutely positioned keeps the
      // definitions live without occupying layout.
      className="pointer-events-none absolute size-0"
    >
      <defs>
        <linearGradient id="session-up" x1="0" y1="0" x2="0" y2="1">
          <stop
            offset="0%"
            stopColor="var(--color-semantic-up)"
            stopOpacity="0.46"
          />
          <stop
            offset="55%"
            stopColor="var(--color-semantic-up)"
            stopOpacity="0.14"
          />
          <stop
            offset="100%"
            stopColor="var(--color-semantic-up)"
            stopOpacity="0"
          />
        </linearGradient>

        {/* The intraday volume column, lit from above like every other data
            fill that stands proud of its panel (`lit-fill` in globals.css).
            Per bar, not per chart: the default objectBoundingBox units put
            the catch of light on each column's own top edge, which is where
            the eye reads the bar's value. The top stop is --color-chart-bar
            mixed 30% toward white, written as a literal because a presentation
            attribute cannot evaluate color-mix(); the body is the token itself,
            so the darkest pixel of every bar is still the colour measured at
            3.99:1 against the panel, and contrast only rises from there. */}
        <linearGradient id="volume-lit" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#a3afc4" />
          <stop offset="35%" stopColor="var(--color-chart-bar)" />
          <stop offset="100%" stopColor="var(--color-chart-bar)" />
        </linearGradient>
        <linearGradient id="session-down" x1="0" y1="0" x2="0" y2="1">
          <stop
            offset="0%"
            stopColor="var(--color-semantic-down)"
            stopOpacity="0.46"
          />
          <stop
            offset="55%"
            stopColor="var(--color-semantic-down)"
            stopOpacity="0.14"
          />
          <stop
            offset="100%"
            stopColor="var(--color-semantic-down)"
            stopOpacity="0"
          />
        </linearGradient>
      </defs>
    </svg>
  );
}
