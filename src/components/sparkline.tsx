// Intraday sparkline drawn straight from the stored snapshots — no chart
// library, and no data of its own beyond the points it is handed.

export function Sparkline({
  values,
  up,
  previousClose,
  width = 96,
  height = 28,
}: {
  values: number[];
  /** The day's change against the previous close, which is what the colour says. */
  up: boolean;
  /** Drawn as the reference the colour is measured from (see below). */
  previousClose: number;
  width?: number;
  height?: number;
}) {
  if (values.length < 2) {
    return (
      <span className="inline-block text-xs text-muted" style={{ width }}>
        —
      </span>
    );
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  // The previous close is in the range so its line is always on the plate.
  const low = Math.min(min, previousClose);
  const span = Math.max(max, previousClose) - low || 1;
  const step = width / (values.length - 1);
  const pad = 2;
  const usable = height - pad * 2;

  const yOf = (value: number) => pad + usable - ((value - low) / span) * usable;
  const coords = values.map((value, i) => [i * step, yOf(value)] as const);
  const points = coords
    .map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`)
    .join(" ");

  // The line closed down to the baseline. The fill is what gives a sparkline
  // any mass at 96x28 — as a bare stroke it was a grey-scale page's only colour
  // and still read as a hairline. Gradient defs live in ChartGradients.
  const area = `${points} ${(width).toFixed(2)},${height} 0,${height}`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="overflow-visible"
      role="img"
      // DESIGN.md requires a chart's accessible name to state its range where
      // one exists. This said only "Trending up today", so a screen reader got
      // the direction the adjacent signed number already gave it, and none of
      // the shape.
      // The colour is the day against the previous close, and the line is
      // only the session from the open: a day that opened higher and slid
      // is up and drawn falling. The label says both, so it never contradicts
      // its own numbers.
      aria-label={`${up ? "Up" : "Down"} on the previous close of ${previousClose.toFixed(
        2,
      )}; this session from ${values[0].toFixed(2)} to ${values[values.length - 1].toFixed(
        2,
      )}, low ${min.toFixed(2)}, high ${max.toFixed(2)}`}
    >
      <polygon
        className="chart-area"
        points={area}
        fill={up ? "url(#session-up)" : "url(#session-down)"}
      />
      {/* The previous close, dashed: what the colour is measured from, so a
          green line that falls all day still visibly ends above it. */}
      <line
        x1={0}
        x2={width}
        y1={yOf(previousClose)}
        y2={yOf(previousClose)}
        stroke="var(--color-muted)"
        strokeWidth={1}
        strokeDasharray="2 3"
        opacity={0.7}
      />
      <polyline
        className="chart-line"
        pathLength={1}
        points={points}
        fill="none"
        stroke={up ? "var(--color-semantic-up)" : "var(--color-semantic-down)"}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* The session's closing point, so the eye has somewhere to land and the
          line reads as having an end rather than running off the plate. */}
      <circle
        className="chart-point"
        cx={coords[coords.length - 1][0]}
        cy={coords[coords.length - 1][1]}
        r={2}
        fill={up ? "var(--color-semantic-up)" : "var(--color-semantic-down)"}
      />
    </svg>
  );
}
