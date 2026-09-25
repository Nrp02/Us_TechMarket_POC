// This stock's today change% against the average change% of its peers
// (src/lib/symbols.ts's PEERS map). Pure and free of any database import for
// the same reason period-performance.ts is.

export type PeerComparison = {
  /** Mean change% across whichever peers have a cached price; null if none do. */
  peerAveragePercent: number | null;
  /** This stock's change% minus the peer average; null when the average is. */
  vsPeersPercent: number | null;
};

/**
 * `peerChangePercents` is already filtered to peers with a known price — a
 * peer missing from price_cache (not yet refreshed) is simply absent from
 * this list rather than treated as a zero move.
 */
export function computePeerComparison(
  stockChangePercent: number,
  peerChangePercents: number[],
): PeerComparison {
  if (peerChangePercents.length === 0) {
    return { peerAveragePercent: null, vsPeersPercent: null };
  }

  const peerAveragePercent =
    peerChangePercents.reduce((sum, v) => sum + v, 0) / peerChangePercents.length;

  return {
    peerAveragePercent,
    vsPeersPercent: stockChangePercent - peerAveragePercent,
  };
}

/** "same" and "opposite" compare sign only, never magnitude. */
export type DivergenceDirection = "same" | "opposite" | "flat" | null;

export type Divergence = {
  vsSectorPercent: number | null;
  vsMarketPercent: number | null;
  vsSectorDirection: DivergenceDirection;
  vsMarketDirection: DivergenceDirection;
};

function direction(stockChangePercent: number, otherChangePercent: number | null): DivergenceDirection {
  if (otherChangePercent === null) return null;
  if (stockChangePercent === 0 || otherChangePercent === 0) return "flat";
  return Math.sign(stockChangePercent) === Math.sign(otherChangePercent) ? "same" : "opposite";
}

/**
 * How far today's move sits from the sector (XLK) and market (SPY) proxies,
 * plus whether the stock moved the same way as each. `sectorChangePercent`/
 * `marketChangePercent` are null before the first refresh of a session (see
 * `Activity.sector`/`.market` in queries.ts) — every field mirrors that
 * nullability rather than substituting a zero.
 */
export function computeDivergence(
  stockChangePercent: number,
  sectorChangePercent: number | null,
  marketChangePercent: number | null,
): Divergence {
  return {
    vsSectorPercent: sectorChangePercent === null ? null : stockChangePercent - sectorChangePercent,
    vsMarketPercent: marketChangePercent === null ? null : stockChangePercent - marketChangePercent,
    vsSectorDirection: direction(stockChangePercent, sectorChangePercent),
    vsMarketDirection: direction(stockChangePercent, marketChangePercent),
  };
}
