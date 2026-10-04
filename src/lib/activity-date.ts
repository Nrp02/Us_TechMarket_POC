// Shared date-param resolution for the three pages with a historical picker
// (Today's Activity, Stocks, Market) — one place so their retention-driven
// bounds and default-to-latest behavior can't drift apart between pages.

import type { DateOption } from "@/components/date-picker";
import { formatDay } from "@/lib/format";

/** A hand-edited or stale `date` param falls back to undefined (the live/latest session) rather than breaking the page. */
export function resolveActivityDay(
  requested: string | undefined,
  availableDates: string[],
): string | undefined {
  return requested && availableDates.includes(requested) ? requested : undefined;
}

/**
 * Which Session a page shows. `symbolLatest` is the stock's own last Session,
 * used when the stock is missing the newest one; `isHistorical` means the figures
 * come from stored closes rather than the live quote.
 */
export function resolvePageDay(input: {
  requestedDate: string | undefined;
  availableDates: string[];
  symbolLatest: string | null;
  latest: string | null;
  today: string;
}): { day: string; defaultDay: string; isHistorical: boolean } {
  const defaultDay = input.symbolLatest ?? input.latest ?? input.today;
  const day = resolveActivityDay(input.requestedDate, input.availableDates) ?? defaultDay;
  return { day, defaultDay, isHistorical: input.latest != null && day !== input.latest };
}

export function buildActivityDateOptions(
  availableDates: string[],
  currentDay: string,
  today: string,
  hrefFor: (day: string) => string,
): DateOption[] {
  return availableDates.map((d) => ({
    key: d,
    label: d === today ? "Today" : formatDay(d),
    href: hrefFor(d),
    current: d === currentDay,
  }));
}

export function activityDateLabel(currentDay: string, today: string): string {
  return currentDay === today ? "Today" : formatDay(currentDay);
}
