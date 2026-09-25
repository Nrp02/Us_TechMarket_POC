import { formatPercent, formatPrice } from "@/lib/format";

// Three small charts for the three Today's Story sections whose content is
// genuinely numeric and comparative (see the spec under
// .scratch/todays-story). Every value here already exists on the Activity
// payload or is derived from it with the same pure engines the narrative
// itself was built from — no new fetch, no new computation.
//
// ComparisonBars and RangeBar are plain CSS bars rather than SVG: both are a
// single magnitude on a scale, which a div and a width percentage draws
// exactly as well as a <rect> would, with none of the text-baseline alignment
// SVG bar labels need. YtdChart is the one shape that is actually a line over
// time, so it reuses Sparkline's own polyline/polygon-over-gradient drawing
// rather than inventing a second way to plot a series.

const UP = "var(--color-semantic-up)";
const DOWN = "var(--color-semantic-down)";

function tone(value: number | null): "up" | "down" | "neutral" {
  if (value == null) return "neutral";
  return value >= 0 ? "up" : "down";
}

export function ComparisonBars({
  stock,
  sector,
  market,
  peerAverage,
}: {
  stock: number;
  sector: number | null;
  market: number | null;
  peerAverage: number | null;
}) {
  const rows: { label: string; value: number | null }[] = [
    { label: "This stock", value: stock },
    { label: "Sector (XLK)", value: sector },
    { label: "Market (SPY)", value: market },
    { label: "Peer avg.", value: peerAverage },
  ];

  const maxAbs = Math.max(1, ...rows.map((r) => (r.value == null ? 0 : Math.abs(r.value))));

  return (
    <div
      className="flex flex-col gap-2.5"
      role="img"
      aria-label={`Today's percent change: this stock ${formatPercent(stock)}, sector ${
        sector == null ? "not available" : formatPercent(sector)
      }, market ${market == null ? "not available" : formatPercent(market)}, peer average ${
        peerAverage == null ? "not available" : formatPercent(peerAverage)
      }.`}
    >
      {rows.map((row) => {
        const t = tone(row.value);
        const widthPercent = row.value == null ? 0 : (Math.abs(row.value) / maxAbs) * 50;
        return (
          <div key={row.label} className="flex items-center gap-2 text-xs">
            <span className="w-20 shrink-0 text-muted">{row.label}</span>
            <div className="relative h-2.5 flex-1 rounded-full bg-surface-soft">
              <span
                aria-hidden
                className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-hairline"
              />
              {row.value != null && (
                <span
                  aria-hidden
                  className={`absolute inset-y-0 rounded-full ${
                    t === "up" ? "bg-semantic-up" : "bg-semantic-down"
                  }`}
                  style={
                    row.value >= 0
                      ? { left: "50%", width: `${widthPercent}%` }
                      : { right: "50%", width: `${widthPercent}%` }
                  }
                />
              )}
            </div>
            <span
              className={`w-14 shrink-0 text-right font-mono tabular-nums ${
                t === "up" ? "text-semantic-up" : t === "down" ? "text-semantic-down" : "text-muted"
              }`}
            >
              {row.value == null ? "—" : formatPercent(row.value)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function RangeBar({
  min,
  max,
  current,
}: {
  min: number;
  max: number;
  current: number;
}) {
  const span = max - min || 1;
  const position = Math.min(1, Math.max(0, (current - min) / span));

  return (
    <div className="flex flex-col gap-2">
      <div
        className="relative h-2.5 rounded-full bg-surface-soft"
        role="img"
        aria-label={`Trailing range from ${formatPrice(min)} to ${formatPrice(
          max,
        )}, today's price ${formatPrice(current)}, ${Math.round(position * 100)}% of the way from the low to the high.`}
      >
        <span
          aria-hidden
          className="absolute top-1/2 size-3 -translate-y-1/2 rounded-full border-2 border-canvas bg-primary"
          style={{ left: `calc(${position * 100}% - 6px)` }}
        />
      </div>
      <div className="flex justify-between font-mono text-micro tabular-nums text-muted">
        <span>{formatPrice(min)}</span>
        <span>{formatPrice(max)}</span>
      </div>
    </div>
  );
}

export function YtdChart({
  closes,
  width = 220,
  height = 84,
}: {
  /** Any order; sorted here so a caller can pass the raw daily_closes rows. */
  closes: { tradingDay: string; close: number }[];
  width?: number;
  height?: number;
}) {
  const sorted = [...closes].sort((a, b) => a.tradingDay.localeCompare(b.tradingDay));

  if (sorted.length < 2) {
    return <p className="text-xs text-muted">Not enough of this year&apos;s trading history yet.</p>;
  }

  const values = sorted.map((row) => row.close);
  const up = values[values.length - 1] >= values[0];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pad = 3;
  const usable = height - pad * 2;
  const step = width / (values.length - 1);

  const coords = values.map((value, i) => {
    const y = pad + usable - ((value - min) / span) * usable;
    return [i * step, y] as const;
  });
  const points = coords.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
  const area = `${points} ${width.toFixed(2)},${height} 0,${height}`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-auto w-full"
      role="img"
      aria-label={`Year-to-date daily close, ${up ? "trending up" : "trending down"} overall, from ${formatPrice(
        values[0],
      )} to ${formatPrice(values[values.length - 1])}.`}
    >
      <polygon
        className="chart-area"
        points={area}
        fill={up ? "url(#session-up)" : "url(#session-down)"}
      />
      <polyline
        className="chart-line"
        pathLength={1}
        points={points}
        fill="none"
        stroke={up ? UP : DOWN}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        className="chart-point"
        cx={coords[coords.length - 1][0]}
        cy={coords[coords.length - 1][1]}
        r={2.5}
        fill={up ? UP : DOWN}
        stroke="var(--color-canvas)"
        strokeWidth={1.5}
      />
    </svg>
  );
}
