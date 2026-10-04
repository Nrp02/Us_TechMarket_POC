import {
  formatPercent,
  formatPrice,
  formatRelVolume,
  formatVolume,
} from "@/lib/format";
import type { Activity } from "@/lib/queries";

// The same divided band as Market Overview, for the same reason: five equally
// bordered plates read as a template, and this page already has a stronger
// element above it. Every value here is on the page's Activity payload — these
// cells add no query and certainly no fetch.
//
// The readings sit a step below Market Overview's figure scale on purpose. Here
// they support the header price and the summary; on Home the index levels are
// the page's primary content. Same component shape, different rank.

function Cell({
  label,
  value,
  detail,
  tone = "neutral",
  enter,
}: {
  label: string;
  value: string;
  detail: string;
  tone?: "neutral" | "up" | "down";
  // Its beat in the page's arrival (globals.css, "The page arriving").
  enter: string;
}) {
  const toneClass =
    tone === "up"
      ? "text-semantic-up"
      : tone === "down"
        ? "text-semantic-down"
        : "text-ink";

  return (
    <article className="panel px-4 py-4 min-[600px]:px-5 min-[600px]:py-5" data-enter={enter}>
      <h3 className="text-micro font-semibold text-muted">{label}</h3>
      {/* text-figure, not text-3xl. Both resolved to a large mono reading in a
          stat card, but Market Overview's ran at a clamp topping out at 38px
          while these sat at 30px — the same role at two sizes on two pages of
          one product. The token is the shared step now and both import it. */}
      <p
        className={`mt-3 font-mono text-figure font-medium tabular-nums ${toneClass}`}
      >
        {value}
      </p>
      <p className="mt-2 text-xs leading-relaxed text-body">{detail}</p>
    </article>
  );
}

function tone(value: number | null | undefined) {
  if (value == null) return "neutral" as const;
  return value >= 0 ? ("up" as const) : ("down" as const);
}

export function ActivityStats({ activity }: { activity: Activity }) {
  const { ticker, sector, market, news, events, peers, periodPerformance } = activity;

  return (
    <section>
      <h2 className="sr-only">Today&apos;s statistics</h2>

      {/* Seven cards now, not five — Peers and Period Performance were added
          for YTD/MTD and peer-comparison context (see the spec under
          .scratch/todays-story). The five originals are unchanged in content
          and order; the two new cards land immediately before the existing
          "odd one out" card, so News & Events stays last exactly as it was.

          The old five-card math (2+2+1 / 3+2 / 5, with the span this section
          used to carry now retired — see market-overview.tsx's note on why an
          orphaned empty cell reads better than a card that outsizes its
          siblings) does not carry over unchanged: five is prime, seven is not.
          Re-derived rather than copy-pasted: 2 columns below 600 (4 rows,
          orphaning 1), 3 from 600 (3 rows, orphaning 2), 4 from xl (2 rows,
          orphaning 1) — no spanning, matching the settled Home pattern.
          Measured live (fixed-position same-origin iframe, not the
          `flex justify-center` body's own layout flow — a plain child
          iframe there shrinks to fit like any other flex item and under-
          reports its width) at every CLAUDE.md breakpoint: 390 / 430 / 600 /
          768 / 834 / 1024 / 1130 / 1280 / 1470 / 1920. `scrollWidth` equalled
          the viewport at all ten — no spanning bug, no overflow.

          One real defect this surfaced: the Peers cell's `value` used to be
          `"${percent} vs peers"`, set at the same text-figure size as every
          other cell's bare number. At three and four columns (834–1280) that
          phrase wrapped to two lines — "vs" then "peers" alone on the second
          — and the card grew taller than its row siblings, which is exactly
          the row-height break the orphan/no-span rule above exists to avoid.
          The number moved back to being the whole value; "vs peers" moved
          into `detail`, matching how Sector/Market already state what a
          percentage is measured against. */}
      <div className="grid grid-cols-2 gap-3 min-[600px]:grid-cols-3 min-[600px]:gap-4 xl:grid-cols-4">
        <Cell
          label="Price Movement"
          enter="1"
          value={formatPercent(ticker.changePercent)}
          detail={`${formatPrice(ticker.price)} at last close`}
          tone={tone(ticker.changePercent)}
        />

        <Cell
          label="Trading Activity"
          enter="2"
          value={formatRelVolume(ticker.relativeVolume)}
          detail={
            ticker.volume == null
              ? "Volume unavailable"
              : `${formatVolume(ticker.volume)} shares vs 10-day average`
          }
          // Heavy volume is not good or bad in itself, so this cell stays
          // neutral rather than borrowing the up/down colours.
        />

        <Cell
          label="Sector Performance"
          enter="3"
          value={sector ? formatPercent(sector.changePercent) : "—"}
          detail="Technology sector (XLK)"
          tone={tone(sector?.changePercent)}
        />

        <Cell
          label="Market Performance"
          enter="4"
          value={market ? formatPercent(market.changePercent) : "—"}
          detail="S&P 500 (SPY)"
          tone={tone(market?.changePercent)}
        />

        <Cell
          label="Peers"
          enter="4"
          value={
            peers.vsPeersPercent == null
              ? "—"
              : formatPercent(peers.vsPeersPercent)
          }
          detail={
            peers.symbols.length === 0
              ? "No peer data"
              : peers.peerAveragePercent == null
                ? `vs ${peers.symbols.join(", ")} (prices unavailable)`
                : `vs ${peers.symbols.join(", ")}, averaging ${formatPercent(peers.peerAveragePercent)}`
          }
          tone={tone(peers.vsPeersPercent)}
        />

        <Cell
          label="Period Performance"
          enter="4"
          value={
            periodPerformance.ytdPercent == null
              ? "—"
              : `YTD ${formatPercent(periodPerformance.ytdPercent)}`
          }
          detail={
            periodPerformance.mtdPercent == null
              ? "MTD unavailable"
              : `MTD ${formatPercent(periodPerformance.mtdPercent)}`
          }
          tone={tone(periodPerformance.ytdPercent)}
        />

        <Cell
          label="News & Events"
          enter="4"
          value={String(news.length + events.length)}
          detail={`${news.length} article${news.length === 1 ? "" : "s"}, ${
            events.length
          } upcoming event${events.length === 1 ? "" : "s"}`}
        />
      </div>
    </section>
  );
}
