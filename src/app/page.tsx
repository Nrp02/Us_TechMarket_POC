import { MarketOverview } from "@/components/market-overview";
import { NewsTeaser } from "@/components/news-teaser";
import { SessionDigest } from "@/components/session-digest";
import { TopMovers } from "@/components/top-movers";
import { WatchlistTable } from "@/components/watchlist-table";
import { formatDayLong } from "@/lib/format";
import { getNewsTeaser, getSessionStamp, getTickers } from "@/lib/queries";
import { INDEX_SYMBOLS, TOP_20_SYMBOLS } from "@/lib/symbols";

// Reads cached tables only, never an upstream API.
//
// Deliberately not "force-dynamic": that setting also means revalidate 0, which
// switched off the data cache in lib/queries.ts and made every render re-query
// Supabase.

// Headroom for the read path's retry budget, not an expectation. A healthy
// render is ~93ms on a cache hit and ~547ms on a miss; the ceiling only matters
// when lib/db-read.ts is spending its per-attempt timeouts, and getSparklines is
// two sequential reads, so the worst case is ~13s. The page routes previously
// set nothing and ran on the platform default, which is below that.
export const maxDuration = 30;

export default async function Home() {
  // One ticker fetch covering indices + Top 20, sliced into the two views
  // below — INDEX_SYMBOLS and TOP_20_SYMBOLS each independently trigger a
  // full-session sparkline scan, so two separate calls would run that scan
  // twice for the same day.
  //
  // `Promise.all` rather than `allSettled`, and that is now a decision rather
  // than a default. Reads throw on failure (lib/db-read.ts), so allSettled would
  // let one failed arm render a page missing its charts or its prices — which is
  // precisely the reported symptom this whole change exists to remove. A page
  // that renders three-quarters of itself cannot be told from a quiet market.
  // Failing to app/error.tsx costs one visitor one render, recoverable with its
  // Try again button; the silent-empty it replaces cost every visitor a full
  // minute and no reload could fix it.
  const [all, news, session] = await Promise.all([
    getTickers([...INDEX_SYMBOLS, ...TOP_20_SYMBOLS]),
    getNewsTeaser(3),
    // The same cached read the shell's session marker makes, so naming the day
    // for a screen reader here costs no extra query.
    getSessionStamp(),
  ]);
  const bySymbol = new Map(all.map((t) => [t.symbol, t]));
  const indices = INDEX_SYMBOLS.map((s) => bySymbol.get(s)).filter((t) => t != null);
  const top20 = TOP_20_SYMBOLS.map((s) => bySymbol.get(s)).filter((t) => t != null);

  return (
    <div className="page-enter flex flex-col gap-10 pb-10">
      {/* Home has no display element, and that is the change rather than an
          omission. The 52px heading was the session date, which is now stated
          in the shell on every route — the product runs on New York time and
          is read from Bangkok, so the day belongs where it is true everywhere
          rather than on the one page that happened to have room for it.

          What is left is the answer instead of the label. The page opens on
          the digest of the session, then market, then the visitor's own
          stocks, then news: a reading order that starts wide and narrows,
          where before it started with the page's own name for itself.

          It also closes the header's hole. The old band was 1152x191 with the
          heading occupying 442x87 of it and the digest 352x191 opposite —
          roughly 114,000px2, 52% of the band, empty in an L, growing to 838px
          of gap at 1920. The band is gone, so the hole cannot be composed
          around; it simply is not there.

          The h1 survives as sr-only. A page needs a heading, the vocabulary
          already existed on this element, and the accessible name should say
          which session is being reported rather than leave the document
          nameless. */}
      <h1 className="sr-only">
        {session
          ? `Market session of ${formatDayLong(session.day)}`
          : "US TechMarket — no session recorded yet"}
      </h1>

      <SessionDigest tickers={top20} />

      <MarketOverview tickers={indices} />

      {/* Watchlist and Top Movers side by side, and the breakpoint is measured
          rather than chosen — it is the smallest viewport at which both can be
          themselves at once.

          The table's panel needs 748px (746px of min-content plus its own 1px
          borders — the track sizes a border box while min-width sizes a content
          box, and at 788 against 790 that 2px difference alone made the table
          scroll). Top Movers needs about 300px: below that its two-line row runs
          out of room for the company name, since a 24px rank, an 80px logo
          plate and the padding are fixed before any text.

          748 + 24 gap + 300 + 48 shell padding = 1120px of viewport. Hence
          1130 — the same round-up-to-a-clean-ten this file already took when
          1384 became 1390.

          It was 1440 until Rel. Volume was folded into the Volume cell, which
          took the table from 788px to 736px and bought 60px of breakpoint, and
          1390 until navigation moved out of the 240px left rail. That last
          move is worth 260px here and it changes what a laptop sees: at 1280
          this page went from one stacked column to the two-column composition
          it was drawn for. Below the breakpoint they stack, because the
          alternative is a watchlist that scrolls sideways permanently — and
          the table is the page's primary object while Top Movers is a digest
          of it. A digest does not get to cost the thing it summarises. */}
      <div className="grid grid-cols-1 gap-10 min-[1130px]:grid-cols-[minmax(748px,1fr)_minmax(300px,360px)] min-[1130px]:gap-6">
        <WatchlistTable tickers={top20} />
        <TopMovers tickers={top20} />
      </div>

      {/* Market News runs full width now, its three articles in a row rather
          than a column. It was sharing a two-up row with Top Movers, and losing
          that slot is what freed the width — the teaser is three headlines, and
          three headlines read better across than stacked in a half-column. */}
      <NewsTeaser items={news} />
    </div>
  );
}
