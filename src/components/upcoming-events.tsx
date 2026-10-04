import { SectionHeading } from "@/components/section-heading";
import { formatEtDate } from "@/lib/format";
import type { UpcomingEvent } from "@/lib/queries";

// Earnings date and earnings call only, from Finnhub's calendar. No free API
// covers conference or product events, so none are shown rather than invented.
//
// Finnhub reports *when in the day* a company reports as a window ("after market
// close"), never a time, so only the date and that label are rendered — a clock
// time here would be a number nobody supplied.

const LABEL: Record<UpcomingEvent["type"], string> = {
  earnings_date: "Earnings date",
  earnings_call: "Earnings call",
};

export function UpcomingEvents({ events }: { events: UpcomingEvent[] }) {
  return (
    <section>
      <SectionHeading meta="From the earnings calendar">
        Upcoming Events
      </SectionHeading>

      {events.length ? (
        <ul className="panel pane-quiet overflow-hidden">
          {events.map((event) => (
            <li
              key={`${event.type}-${event.at}`}
              // flex-wrap: at a large text size the date no longer fits beside
              // the label and was cut off by the panel; it now drops under it.
              className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-hairline px-5 py-4 last:border-0"
            >
              <div>
                <p className="text-sm font-semibold text-ink">
                  {LABEL[event.type]}
                </p>
                {event.note && (
                  <p className="mt-0.5 text-xs text-muted">{event.note}</p>
                )}
              </div>
              <span className="shrink-0 font-mono text-sm tabular-nums text-body">
                {formatEtDate(event.at)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="panel pane-quiet px-5 py-10 text-sm text-muted">
          No earnings date on the calendar for this stock.
        </p>
      )}
    </section>
  );
}
