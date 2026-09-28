import Link from "next/link";

import { DatePicker, type DateOption } from "@/components/date-picker";
import { NewsList } from "@/components/news-list";
import { formatDay } from "@/lib/format";
import { tradingDay } from "@/lib/market";
import type { NewsCategory } from "@/lib/news-category";
import { resolveNewsDate } from "@/lib/news-date";
import { getNews, getNewsDates } from "@/lib/queries";
import { SECTORS } from "@/lib/symbols";

// The one route still inheriting the layout's bare product name, so a News tab
// and a Home tab were the same string. The template in layout.tsx appends the
// product name, so this is only the part that differs.
export const metadata = { title: "News" };

// Reads the cached news table only. Fetching and summarising happen in the
// scheduled ingestion job, never on a page view.
//
// Not "force-dynamic" — see the note on the Home page: it implies revalidate 0
// and disables the data cache these reads depend on. The cookie read below is
// what keeps the route dynamic.

const TABS = [
  { key: "stock", label: "Stock News" },
  { key: "market", label: "Market News" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

function isTab(value: string | undefined): value is TabKey {
  return TABS.some((t) => t.key === value);
}

// A tab switch used to also silently reset the date filter, and a date switch
// reset the tab, because each control only ever wrote its own query param.
// Every link on this page is built through here so both survive together.
// The symbol/sector filter only applies on the Stock News tab, so switching
// to Market News drops it rather than carrying a filter that tab can't use.
function buildHref(
  tab: TabKey,
  date?: string,
  filter?: { sector?: string },
): string {
  const params = new URLSearchParams();
  if (tab !== "stock") params.set("tab", tab);
  if (date) params.set("date", date);
  if (tab === "stock" && filter?.sector) params.set("sector", filter.sector);
  const qs = params.toString();
  return qs ? `/news?${qs}` : "/news";
}

// Headroom for the read path's retry budget in lib/db-read.ts — see the note on
// the same export in app/(market)/page.tsx.
export const maxDuration = 30;

export default async function News({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; date?: string; sector?: string }>;
}) {
  const { tab, date, sector } = await searchParams;
  const active: TabKey = isTab(tab) ? tab : "stock";
  const today = tradingDay();

  // Only meaningful on the Stock News tab; a stray param on Market News is
  // ignored rather than silently filtering a tab with no chips of its own.
  const activeSector = active === "stock" && sector && SECTORS.includes(sector) ? sector : undefined;

  // Resolved before the article read, since the read needs to know which day
  // (or "no day") to filter to. A hand-edited or stale `date` param falls back
  // to today rather than showing an empty page with no explanation.
  const availableDates = await getNewsDates();
  const resolved = resolveNewsDate(date, today, availableDates);

  const items = await getNews(active as NewsCategory, resolved.date, undefined, {
    sector: activeSector,
  });

  const dateLabel = resolved.isAll
    ? "All dates"
    : resolved.isToday
      ? "Today"
      : formatDay(resolved.date!);

  // Every date the floor admits is offered, with no second cap of its own.
  // getNewsDates already returns at most the seven retained days (the floor in
  // lib/news-retention.ts), and a count kept here as well could only disagree
  // with it — a `slice(0, 6)` silently dropped the oldest day whenever today
  // had no articles yet and all seven days were past ones.
  const otherDates = availableDates.filter((d) => d !== today);

  const currentFilter = { sector: activeSector };

  const dateOptions: DateOption[] = [
    {
      // Explicitly `today` rather than a bare /news, which no longer means the
      // same thing: with no date param the page now lands on the newest day
      // that has articles. Choosing Today has to stay a request the resolver
      // can tell apart from not choosing at all, or the picker could not offer
      // today's empty state.
      key: "today",
      label: "Today",
      href: buildHref(active, today, currentFilter),
      current: resolved.isToday,
    },
    ...otherDates.map((d) => ({
      key: d,
      label: formatDay(d),
      href: buildHref(active, d, currentFilter),
      current: resolved.date === d && !resolved.isToday,
    })),
    {
      key: "all",
      label: "All dates",
      href: buildHref(active, "all", currentFilter),
      current: resolved.isAll,
      separator: true,
    },
  ];

  const emptyMessage = resolved.isToday
    ? "No articles recorded yet today. Check back after the next news cycle, or switch to All dates to see recent coverage."
    : resolved.isAll
      ? "No articles in this category yet."
      : `No articles from ${formatDay(resolved.date!)} in this category.`;

  return (
    // gap-10, matching Home and Today's Activity. The three routes ran 40 / 40
    // / 24 for the same relationship, which is legible as News feeling 40%
    // tighter than the other two without a visitor being able to name why.
    // Keyed on the day: the arrival animations are one-shot CSS keyframes that
    // play on mount, and a ?date= change re-renders this same route, so React
    // kept the old nodes and only the few whose own keys changed replayed —
    // some charts redrew and the rest sat still. A new key remounts the page,
    // the same as navigating to it.
    <div key={resolved.isAll ? "all" : (resolved.date ?? today)} className="page-enter flex flex-col gap-10 pb-10">
      {/* This page's h1 was 24px while Home's ran to 52px, so the two pages
          opened at completely different ranks. Both are the one display element
          on their surface and both take the display step. */}
      <header className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="page-title text-ink">News</h1>
          {/* The measure belongs on the paragraph, not on a 16px wrapper — see
              the note on the Home header for what `ch` actually resolves to. */}
          <p className="mt-3 max-w-[49ch] text-sm text-body">
            Every summary is AI-written from the source article. Latest first.
          </p>
        </div>
        <p className="shrink-0 font-mono text-xs tabular-nums text-muted">
          {items.length} article{items.length === 1 ? "" : "s"} in this tab
        </p>
      </header>

      {/* Fixed latest-first list — no sort control and no grid toggle by design.
          The tabs sit in their own recessed track rather than floating loose on
          the page field, so the set reads as one control and the active pill as
          a thing lifted out of it. The date picker is a second, independent
          filter on the same row, right-aligned so the two read as separate
          controls rather than one continuous strip. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav
          aria-label="News categories"
          // The stadium is the single-row form. Below 600 the four tabs do not
          // fit one line (91 + 138 + 130 + 121 + gaps is about 492 against ~350
          // of content column), so the track wraps to two rows, its corner arc
          // becomes half of 102px, and the active pill's own rounded corner
          // ends up as much as 7.6px outside it — the pill visibly poking out
          // of the card. Two stacked rows are a block, not a segmented
          // control, so they take the container radius. 600 is where the four
          // fit one line again: ~500px of track plus the 48px shell.
          className="panel-track-block min-[600px]:panel-track inline-flex w-fit max-w-full flex-wrap gap-1 p-1"
        >
          {TABS.map((t) => {
            const isActive = t.key === active;
            // `resolved.date` is already the concrete day in every case that
            // is not "all", today included, so the tab links carry it as-is.
            // Dropping it for today was safe only while a bare /news meant
            // today; now it would hand the resolver an empty request from a
            // page that had made a choice, and switching tabs could silently
            // move the visitor to a different day.
            const dateParam = resolved.isAll
              ? "all"
              : (resolved.date ?? undefined);
            return (
              <Link
                key={t.key}
                href={buildHref(t.key, dateParam, t.key === "stock" ? currentFilter : undefined)}
                // The active tab was colour-only to a screen reader.
                aria-current={isActive ? "page" : undefined}
                // The active tab used to be a solid --color-primary-fill plate
                // under white text. It was the only opaque, fully saturated
                // object left in a world made of glass and weather, so it read
                // as a control borrowed from a different product — and its
                // royal blue sat a long way from the deep atmospheric blue
                // everything else in the page is lit by.
                //
                // It is now the same `nav-active` recipe the nav card's current
                // item uses: a translucent accent plate, a lit ring, and
                // --color-primary-active for the label. That is the point of
                // the change rather than a side effect — "this one is current"
                // is one idea, and it should not have two visual languages in
                // one product depending on which nav it appears in.
                // 44px on a touch pointer only. These four are the page's
                // whole filter and they measured 36px — the same gap the nav
                // card closed for itself, on the control a phone visitor
                // reaches for first.
                className={`inline-flex items-center rounded-full px-4 py-2 text-sm font-semibold press pointer-coarse:min-h-11 ${
                  isActive
                    ? "nav-active text-primary-active"
                    : "text-body hover:bg-glass-lift hover:text-ink"
                }`}
              >
                {t.label}
              </Link>
            );
          })}
        </nav>

        {/* Client island — the rest of this page is a server component, but a
            dropdown that closes on outside click needs a listener, which a
            native <details> element (the previous approach here) can't
            provide. See date-picker.tsx for why. */}
        <DatePicker dateLabel={dateLabel} options={dateOptions} />
      </div>

      {/* Stock News has one optional sector filter; Market News has none. */}
      {active === "stock" && (
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={buildHref("stock", resolved.isAll ? "all" : resolved.date ?? undefined)}
            aria-current={!activeSector ? "page" : undefined}
            className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold press ${
              !activeSector
                ? "nav-active text-primary-active"
                : "text-body hover:bg-glass-lift hover:text-ink"
            }`}
          >
            All
          </Link>
          {SECTORS.map((sectorOption) => (
            <Link
              key={sectorOption}
              href={buildHref("stock", resolved.isAll ? "all" : resolved.date ?? undefined, {
                sector: sectorOption,
              })}
              aria-current={activeSector === sectorOption ? "page" : undefined}
              className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold press ${
                activeSector === sectorOption
                  ? "nav-active text-primary-active"
                  : "text-body hover:bg-glass-lift hover:text-ink"
              }`}
            >
              {sectorOption}
            </Link>
          ))}
        </div>
      )}

      <NewsList items={items} emptyMessage={emptyMessage} />
    </div>
  );
}
