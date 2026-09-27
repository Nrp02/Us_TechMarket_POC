// FRED (Federal Reserve Economic Data) free API. Isolated upstream client,
// same posture as finnhub.ts/yahoo.ts — only ever reachable from a scheduled
// ingestion job, enforced by the no-restricted-imports rule in
// eslint.config.mjs.
//
// FRED gives a released value and its own history, never a consensus/
// expectation figure — no free source for that was found (see CLAUDE.md's
// Market Story macro-data note), so the macro section this feeds only ever
// reports "what was released" against "the prior reading," never a
// forecast-vs-actual "surprise."

const BASE = "https://api.stlouisfed.org/fred/series/observations";

/** FRED series IDs Market Story reads. DGS10 is daily; the rest are monthly/quarterly. */
export const FRED_SERIES = {
  cpi: "CPIAUCSL",
  unemployment: "UNRATE",
  gdp: "GDPC1",
  fedFundsRate: "FEDFUNDS",
  tenYearTreasury: "DGS10",
} as const;

export type FredObservation = { date: string; value: number | null };

/**
 * Latest two non-missing observations, newest first. Daily series such as DGS10
 * mark market holidays with ".", so a few extra rows are read and skipped.
 */
export async function fetchLatestTwo(seriesId: string): Promise<FredObservation[]> {
  const key = process.env.FRED_API_KEY;
  if (!key) throw new Error("FRED_API_KEY is not configured");

  const url =
    `${BASE}?series_id=${encodeURIComponent(seriesId)}&api_key=${key}` +
    `&file_type=json&sort_order=desc&limit=6`;
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`FRED ${seriesId} -> ${res.status}`);

  const json = (await res.json()) as { observations?: { date: string; value: string }[] };
  return (json.observations ?? []).map((o) => ({
    date: o.date,
    // FRED marks a missing observation as the literal string ".".
    value: o.value === "." ? null : Number(o.value),
  })).filter((o) => o.value !== null).slice(0, 2);
}
