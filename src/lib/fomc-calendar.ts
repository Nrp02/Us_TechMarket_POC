// FOMC meeting dates are public knowledge published well in advance by the
// Federal Reserve, so they're hardcoded here rather than fetched — same
// one-time-lookup posture as PEERS/CIK_BY_SYMBOL/SECTOR_BY_SYMBOL in
// symbols.ts. Source: federalreserve.gov/monetarypolicy/fomccalendars.htm.
//
// Each meeting is two days; the rate decision is announced on the second day,
// which is the date stored here.

export const FOMC_DECISION_DAYS_2026 = [
  "2026-01-28",
  "2026-03-18",
  "2026-04-29",
  "2026-06-17",
  "2026-07-29",
  "2026-09-16",
  "2026-10-28",
  "2026-12-09",
];

/** True when `day` (a "YYYY-MM-DD" ET trading day) is a scheduled FOMC decision day. */
export function isFomcDay(day: string): boolean {
  return FOMC_DECISION_DAYS_2026.includes(day);
}

/** The most recent FOMC decision day at or before `day`, or null if none yet this year. */
export function mostRecentDecision(day: string): string | null {
  const past = FOMC_DECISION_DAYS_2026.filter((d) => d <= day);
  return past.length ? past[past.length - 1] : null;
}
