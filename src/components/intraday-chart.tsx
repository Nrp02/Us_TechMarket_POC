import { formatEtTime, formatPrice, formatVolume } from "@/lib/format";
import type { IntradayPoint } from "@/lib/queries";

// Price and volume for the session, drawn from the same intraday_snapshots table
// the sparklines read. No chart library and no client JavaScript: the hover
// readout is a native SVG <title> on a transparent hit column, which the browser
// renders as a tooltip on its own.
//
// Price and volume share the time axis but never a y-axis. They are two stacked
// panels with separate scales, not one plot with a second axis bolted on — a
// dual-axis chart lets the crossing point of two unrelated scales imply a
// relationship that isn't in the data.

const WIDTH = 780;
const GUTTER = 64; // right-hand strip reserved for the value labels
const LEFT = 4;
const PLOT_RIGHT = WIDTH - GUTTER;

const PRICE_TOP = 14;
const PRICE_BOTTOM = 188;
const VOLUME_TOP = 216;
const VOLUME_BOTTOM = 278;
const AXIS_Y = 296;
const HEIGHT = 304;

/** Roughly this many time labels, thinned to whole bars. */
const TIME_LABELS = 5;

export function IntradayChart({
  points,
  up,
  previousClose,
}: {
  points: IntradayPoint[];
  /** The day's change against the previous close, which is what the colour says. */
  up: boolean;
  /** Drawn dashed as the reference the colour is measured from. */
  previousClose: number;
}) {
  if (points.length < 2) {
    return (
      <p className="panel px-5 py-10 text-sm text-muted">
        No intraday snapshots stored for this session yet.
      </p>
    );
  }

  const prices = points.map((p) => p.price);
  const low = Math.min(...prices);
  const high = Math.max(...prices);
  // The scale takes in the previous close so its line is always on the plot;
  // the grid is drawn on the scale, so its labels stay true.
  const floor = Math.min(low, previousClose);
  const ceiling = Math.max(high, previousClose);
  const span = ceiling - floor || 1;

  const volumes = points.map((p) => p.volume ?? 0);
  const peakVolume = Math.max(...volumes) || 1;

  const step = (PLOT_RIGHT - LEFT) / (points.length - 1);
  const x = (i: number) => LEFT + i * step;
  const priceY = (value: number) =>
    PRICE_BOTTOM - ((value - floor) / span) * (PRICE_BOTTOM - PRICE_TOP);

  const stroke = up ? "var(--color-semantic-up)" : "var(--color-semantic-down)";
  const line = points.map((p, i) => `${x(i).toFixed(1)},${priceY(p.price).toFixed(1)}`);

  // Bars sit a little narrower than their slot so neighbours never touch.
  const barWidth = Math.max(step - 2, 1.5);

  // Label the first and last bar, plus an even spread between. A periodic label
  // that lands close to the final one is dropped rather than drawn over it.
  const labelEvery = Math.max(1, Math.round(points.length / TIME_LABELS));
  const last = points.length - 1;
  const labelled = new Set<number>([0, last]);
  for (let i = labelEvery; i < last - labelEvery * 0.6; i += labelEvery) {
    labelled.add(i);
  }

  return (
    <>
      <div className="panel overflow-x-auto p-5">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="h-auto w-full min-w-[560px]"
        role="img"
        // The 96x28 sparkline stated direction, open, close, low and high; the
        // 780px chart stated only "from {low} to {high}" — which reads as an
        // open-to-close range and is not one — so the page's largest data
        // object was its least described. Same shape as the sparkline's label
        // now, plus the volume panel, which had no accessible mention at all.
        //
        // Per-point values stay pointer-only: the readout is a native SVG
        // <title> on a hit column, which is what keeps this a server component
        // with no JavaScript. This label carries the shape of the session
        // instead of every reading in it.
        aria-label={
          // The colour is the day against the previous close; the line is
          // only the session from the open, so a day that opened higher and
          // slid is up and drawn falling. The label says both.
          `Intraday price and volume. ${up ? "Up" : "Down"} on the previous close of ${formatPrice(previousClose)}; ` +
          `this session from ${formatPrice(points[0].price)} at ${formatEtTime(points[0].at)} ` +
          `to ${formatPrice(points[last].price)} at ${formatEtTime(points[last].at)}, ` +
          `session low ${formatPrice(low)}, high ${formatPrice(high)}. ` +
          `Peak 15-minute volume ${formatVolume(peakVolume)} shares.`
        }
      >
        {/* Grid stays recessive — it is a reference, not part of the data. */}
        {[ceiling, floor + span / 2, floor].map((value) => {
          const y = priceY(value);
          // The previous close carries its own label (below).
          const hidden = Math.abs(y - priceY(previousClose)) < 14;
          return (
            <g key={value}>
              <line
                x1={LEFT}
                x2={PLOT_RIGHT}
                y1={y}
                y2={y}
                stroke="var(--color-hairline)"
                strokeWidth={1}
              />
              {hidden ? null : (
                <text
                  x={PLOT_RIGHT + 10}
                  y={y + 4}
                  className="fill-[var(--color-muted)] font-mono text-micro"
                >
                  {formatPrice(value)}
                </text>
              )}
            </g>
          );
        })}

        {/* The previous close, dashed: what the colour is measured from, so a
            green line that falls all day still visibly ends above it. */}
        <line
          x1={LEFT}
          x2={PLOT_RIGHT}
          y1={priceY(previousClose)}
          y2={priceY(previousClose)}
          stroke="var(--color-muted)"
          strokeWidth={1}
          strokeDasharray="3 4"
        />
        <text
          x={PLOT_RIGHT + 10}
          y={priceY(previousClose) + 4}
          className="fill-[var(--color-muted)] font-mono text-micro"
        >
          {formatPrice(previousClose)}
        </text>

        {/* Same fill the sparklines carry, from the same document-level
            gradient defs, so a row's 96px chart and this 780px one are visibly
            the same drawing at two scales. Closed to the price panel's own
            floor, not to the volume panel below it. */}
        <polygon
          className="chart-area"
          points={`${line.join(" ")} ${PLOT_RIGHT},${PRICE_BOTTOM} ${LEFT},${PRICE_BOTTOM}`}
          fill={up ? "url(#session-up)" : "url(#session-down)"}
        />
        <polyline
          className="chart-line"
          pathLength={1}
          points={line.join(" ")}
          fill="none"
          stroke={stroke}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* The session's last recorded price, marked so the line has an end. */}
        <circle
          className="chart-point"
          cx={x(last)}
          cy={priceY(points[last].price)}
          r={3.5}
          fill={stroke}
          stroke="var(--color-canvas)"
          strokeWidth={2}
        />

        {/* Volume panel: its own baseline and its own scale. */}
        <line
          x1={LEFT}
          x2={PLOT_RIGHT}
          y1={VOLUME_BOTTOM}
          y2={VOLUME_BOTTOM}
          stroke="var(--color-hairline)"
          strokeWidth={1}
        />
        <text
          x={PLOT_RIGHT + 10}
          y={VOLUME_TOP + 10}
          className="fill-[var(--color-muted)] font-mono text-micro"
        >
          {formatVolume(peakVolume)}
        </text>
        <text
          x={LEFT}
          y={VOLUME_TOP - 8}
          className="fill-[var(--color-muted)] text-micro font-semibold"
        >
          Volume
        </text>

        {points.map((point, i) => {
          const height =
            ((point.volume ?? 0) / peakVolume) * (VOLUME_BOTTOM - VOLUME_TOP);
          return (
            <rect
              key={point.at}
              className="chart-volume"
              x={x(i) - barWidth / 2}
              y={VOLUME_BOTTOM - height}
              width={barWidth}
              height={Math.max(height, 0)}
              rx={2}
              // Its own token rather than surface-strong: these bars are data,
              // so they answer to the 3:1 floor for graphical objects. On
              // surface-strong they measured 1.26:1 against the card.
              // Lit from the top, per bar — see `volume-lit` in
              // chart-gradients.tsx. The body stop is still chart-bar.
              fill="url(#volume-lit)"
            />
          );
        })}

        {/* Time axis, shared by both panels above. */}
        {points.map((point, i) =>
          labelled.has(i) ? (
            <text
              key={point.at}
              x={x(i)}
              y={AXIS_Y}
              // The end labels are anchored inward so neither runs off the plot.
              textAnchor={i === 0 ? "start" : i === last ? "end" : "middle"}
              className="fill-[var(--color-muted)] font-mono text-micro"
            >
              {formatEtTime(point.at).replace(" ET", "")}
            </text>
          ) : null,
        )}

        {/* Transparent hit columns give a native tooltip per bar without JS. */}
        {points.map((point, i) => (
          <rect
            key={`hit-${point.at}`}
            x={x(i) - step / 2}
            y={PRICE_TOP}
            width={step}
            height={VOLUME_BOTTOM - PRICE_TOP}
            fill="transparent"
          >
            <title>
              {`${formatEtTime(point.at)} · ${formatPrice(point.price)}` +
                (point.volume == null
                  ? ""
                  : ` · ${formatVolume(point.volume)} shares`)}
            </title>
          </rect>
        ))}
      </svg>
      </div>

      {/* Same undiscoverable-scroll problem as the watchlist table, same fix.
          This plot has a 560px minimum inside a panel with 40px of its own
          padding, and the content column is viewport − 48 shell padding, so it
          stops scrolling at 648px of viewport — a different number from the
          table's, so it gets its own breakpoint rather than a shared
          approximation.

          It was 888 while the 240px left rail took its width out of the same
          column; the nav card above the content does not.

          Outside the panel, not inside it: a block child of an overflow-x-auto
          container is laid out in the scrollable coordinate space, so this line
          would slide out of view exactly when it became relevant. */}
      <p className="mt-3 text-xs text-muted min-[650px]:hidden">
        Scroll sideways to see the whole session.
      </p>
    </>
  );
}
