// SEC EDGAR — free, no API key. Fetches one company's recent filings by CIK
// from SEC's public per-company submissions endpoint. Only ever called from
// the market-hours-gated refresh cycle (src/lib/refresh.ts), same
// ingestion-architecture rule every other upstream client in this project
// follows — never from a page render or component.
//
// SEC's fair-access policy requires a descriptive User-Agent identifying the
// caller (a name and a real contact), unlike the plain or browser-spoofing
// headers this project's other unauthenticated clients (yahoo.ts,
// backfill-daily-closes.mts) use — SEC actually enforces this one.
const USER_AGENT = "US TechMarket (school project; contact: naruepon.nice@gmail.com)";

const SUBMISSIONS_BASE = "https://data.sec.gov/submissions";

export type Filing = {
  accessionNumber: string;
  form: string;
  filingDate: string;
  /** Comma-separated SEC item codes (e.g. "2.02,9.01"), or "" when the form has none. */
  itemCodes: string;
};

type SubmissionsResponse = {
  filings: {
    recent: {
      form: string[];
      filingDate: string[];
      accessionNumber: string[];
      items: string[];
    };
  };
};

/**
 * Every filing in SEC's "recent" window for this CIK (verified live: up to
 * 1000 entries, spanning several years for an active filer) — no pagination
 * into the submissions endpoint's older `files` array, since this project
 * only ever wants a same-day match and retention caps the table to ~370 days
 * regardless of how far back "recent" reaches.
 */
export async function fetchFilings(cik: string): Promise<Filing[]> {
  const padded = cik.padStart(10, "0");
  const res = await fetch(`${SUBMISSIONS_BASE}/CIK${padded}.json`, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`SEC EDGAR CIK${padded} -> ${res.status}`);

  const { filings } = (await res.json()) as SubmissionsResponse;
  const { form, filingDate, accessionNumber, items } = filings.recent;
  return form.map((f, i) => ({
    form: f,
    filingDate: filingDate[i],
    accessionNumber: accessionNumber[i],
    itemCodes: items[i] ?? "",
  }));
}
