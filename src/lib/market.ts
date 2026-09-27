// US market session state, evaluated in America/New_York so it stays correct
// across EST/EDT without the server's own timezone mattering.

const OPEN_MINUTES = 9 * 60 + 30; // 09:30 ET
const CLOSE_MINUTES = 16 * 60; // 16:00 ET

/** Minutes past midnight ET, or null on a weekend. */
function sessionMinutes(at: Date): number | null {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(at);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const weekday = get("weekday");
  if (weekday === "Sat" || weekday === "Sun") return null;

  return Number(get("hour")) * 60 + Number(get("minute"));
}

export function isMarketOpen(at: Date = new Date()): boolean {
  const minutes = sessionMinutes(at);
  return minutes != null && minutes >= OPEN_MINUTES && minutes < CLOSE_MINUTES;
}

/**
 * How long after 16:00 ET the closing price is still worth collecting.
 *
 * Was 30, which put the last qualifying tick at 16:15 and was too early: the
 * closing print does not reach the upstream chart at the same moment for every
 * symbol, and on ET day 2026-08-21 four of the twenty-five — ORCL, CRM, NOW and
 * VIXY — had no 16:00 bar stored at all. Their timelines therefore showed no
 * "Market close" row, since the rule quite rightly refuses to call an earlier
 * bar the close. An hour reaches the 16:30 and 16:45 ticks, which is inside the
 * cron's own 13-21 UTC window under both EST and EDT.
 *
 * Widening this alone would have made the stored price *worse*, since a later
 * tick reads a Finnhub quote that has drifted further into after-hours. It is
 * only safe together with reconcileClose in lib/closing-price.ts, which stores
 * the closing print instead of the quote. Do not raise one without the other.
 */
const CLOSING_WINDOW_MINUTES = 60;

/**
 * True in the minutes just after the bell.
 *
 * `isMarketOpen` is exclusive of 16:00, so a schedule gated on it alone stops
 * refreshing at 15:45 and the last price ever written is a mid-session quote —
 * which the Today's Activity page then labels "at last close" and the summary
 * prompt hands to the model as the closing price. Letting the ingestion job run
 * once more after the bell is what makes those two labels true.
 */
export function isClosingWindow(at: Date = new Date()): boolean {
  const minutes = sessionMinutes(at);
  return (
    minutes != null &&
    minutes >= CLOSE_MINUTES &&
    minutes < CLOSE_MINUTES + CLOSING_WINDOW_MINUTES
  );
}

/**
 * True when `at` is at or past 16:00 ET on its own day.
 *
 * Distinct from `!isMarketOpen()`, which is also true before the opening bell —
 * a 09:15 timestamp is "not open" but the session has not happened yet, and the
 * timeline needs to tell those apart before it can call a snapshot the close.
 */
export function isAtOrAfterClose(at: Date): boolean {
  const minutes = sessionMinutes(at);
  return minutes != null && minutes >= CLOSE_MINUTES;
}

/** Calendar date in ET, as YYYY-MM-DD — the "trading day" key used for summaries. */
export function tradingDay(at: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
  }).format(at);
}

/** Exact ET midnight and regular 16:00 close; dayWindow is only a broad query window. */
export function sessionDayTimes(day: string): { start: string; close: string } {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", hourCycle: "h23",
  });
  const atHour = (hour: number) => {
    const target = Date.parse(`${day}T${String(hour).padStart(2, "0")}:00:00Z`);
    let instant = target;
    // Resolve local wall time against its actual offset, including DST-change days.
    for (let i = 0; i < 2; i++) {
      const parts = formatter.formatToParts(new Date(instant));
      const part = (type: string) => Number(parts.find((p) => p.type === type)?.value);
      const local = Date.UTC(part("year"), part("month") - 1, part("day"), part("hour"));
      instant += target - local;
    }
    return new Date(instant).toISOString();
  };
  return { start: atHour(0), close: atHour(16) };
}

/**
 * The UTC bounds that contain one New York trading day. New York is UTC-4 or
 * UTC-5, so an ET day always falls between its own midnight UTC and noon UTC the
 * next day; callers narrow with this and then compare trading days exactly.
 *
 * Deliberately wider than the day it selects — it *contains* the day rather than
 * equalling it, which is why every caller re-checks `tradingDay(...) === day`
 * afterwards. A caller that skips that check gets the neighbouring day's rows
 * too, and one that applies a row limit against this window truncates the wrong
 * set (see the note on `limit` in queries.ts).
 */
export function dayWindow(day: string): { from: string; to: string } {
  return {
    from: `${day}T00:00:00Z`,
    to: new Date(Date.parse(`${day}T12:00:00Z`) + 86_400_000).toISOString(),
  };
}
