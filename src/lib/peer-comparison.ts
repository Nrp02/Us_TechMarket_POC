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
