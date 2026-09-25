// Finnhub free tier. Primary source for price and average volume.
//
// Not available on this tier, confirmed by probing at build time:
//   /stock/candle  -> "You don't have access to this resource" (daily + intraday)
//   /quote         -> returns no volume field at all
//   ^VIX, ^GSPC    -> "Market data subscription required for CFD indices"
// Today's traded volume therefore comes from lib/yahoo.ts instead.

const BASE = "https://finnhub.io/api/v1";

export type Quote = {
  price: number;
  change: number;
  changePercent: number;
};

async function get<T>(path: string): Promise<T> {
  const url = `${BASE}${path}&token=${process.env.FINNHUB_API_KEY}`;
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`Finnhub ${path.split("?")[0]} -> ${res.status}`);
  return res.json() as Promise<T>;
}

export async function fetchQuote(symbol: string): Promise<Quote | null> {
  const raw = await get<{ c: number; d: number | null; dp: number | null }>(
    `/quote?symbol=${encodeURIComponent(symbol)}`,
  );
  // Finnhub answers unknown symbols with a zeroed payload rather than an error.
  if (!raw.c) return null;
  return { price: raw.c, change: raw.d ?? 0, changePercent: raw.dp ?? 0 };
}

export type Metrics = {
  avgVolume: number | null;
  epsGrowthQuarterlyYoy: number | null;
  epsGrowthTtmYoy: number | null;
  revenueGrowthQuarterlyYoy: number | null;
  revenueGrowthTtmYoy: number | null;
  grossMarginTtm: number | null;
  netMarginTtm: number | null;
};

/**
 * One `/stock/metric?metric=all` call, covering both average volume (used on
 * every warm run) and the growth/margin fields `fundamentals` wants (used
 * only when that row is missing/stale). A single caller wanting only one half
 * still pays for one call, not two — this used to be two separate functions
 * hitting the identical endpoint, which cost two Finnhub calls in one cycle
 * for any symbol needing both at once.
 */
export async function fetchMetrics(symbol: string): Promise<Metrics> {
  const raw = await get<{ metric?: Record<string, number> }>(
    `/stock/metric?symbol=${encodeURIComponent(symbol)}&metric=all`,
  );
  const m = raw.metric ?? {};
  const millions = m["10DayAverageTradingVolume"];
  return {
    avgVolume: millions ? Math.round(millions * 1_000_000) : null,
    epsGrowthQuarterlyYoy: m["epsGrowthQuarterlyYoy"] ?? null,
    epsGrowthTtmYoy: m["epsGrowthTTMYoy"] ?? null,
    revenueGrowthQuarterlyYoy: m["revenueGrowthQuarterlyYoy"] ?? null,
    revenueGrowthTtmYoy: m["revenueGrowthTTMYoy"] ?? null,
    grossMarginTtm: m["grossMarginTTM"] ?? null,
    netMarginTtm: m["netProfitMarginTTM"] ?? null,
  };
}

export type LatestEarnings = {
  period: string;
  surprisePercent: number | null;
};

/**
 * Most recent quarter's surprise%, or null if none reported yet.
 *
 * `/stock/earnings` responds with a plain array (not wrapped in an object),
 * unlike every other Finnhub endpoint this file calls — confirmed live during
 * planning against the real API for AAPL.
 */
export async function fetchLatestEarnings(symbol: string): Promise<LatestEarnings | null> {
  const rows = await get<{ period: string; surprisePercent: number | null }[]>(
    `/stock/earnings?symbol=${encodeURIComponent(symbol)}`,
  );
  if (!rows.length) return null;

  // Highest `period` (a "YYYY-MM-DD" quarter-end date) is the most recent one.
  const latest = rows.reduce((a, b) => (b.period > a.period ? b : a));
  return { period: latest.period, surprisePercent: latest.surprisePercent ?? null };
}
