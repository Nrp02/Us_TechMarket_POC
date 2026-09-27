"use client";

// The fallback for a render that threw. Without this file Next serves its own
// bare "Application error: a server-side exception has occurred" page, which
// drops the navigation and leaves a visitor with no way back.
//
// Sitting at the app root means it covers all three routes — an error bubbles to
// the nearest boundary above it, and there is no closer one. It renders inside
// the root layout, so the nav card stays and navigation still works.
//
// What reaches here, and what cannot:
//
//   - A FAILED DATABASE READ NOW DOES, and this is its intended destination.
//     This comment used to say the opposite — that a Supabase error "comes back
//     as `{ data: null }` rather than a throw" — and treated that as a property
//     of the design. It was the bug. Every call site read that null as an empty
//     table, and `unstable_cache` then served the empty result to every visitor
//     for a minute: measured on the live site as six consecutive Home renders
//     with no sparklines while the database held the whole session. Reads now
//     retry and then raise (lib/db-read.ts), which is what keeps the wrong
//     answer out of the cache, and raising has to land somewhere visible.
//   - An upstream outage still never does. Pages read cached tables only, and
//     the ingestion job absorbs a Finnhub failure per symbol.
//   - components/session-marker.tsx is deliberately exempt. It renders from the
//     ROOT layout, which is above this boundary, so its read is the one that
//     catches its own failure rather than reaching here.
//   - A throw during *module evaluation* never does either — a missing
//     SUPABASE_SECRET_KEY makes lib/supabase.ts throw on import, which happens
//     before the React tree exists, and Next serves a bare "Internal Server
//     Error" body no boundary can intercept.
//   - The other reachable render throw is a malformed timestamp in a row:
//     Intl.DateTimeFormat rejects an Invalid Date, so every format helper in
//     lib/format.ts that takes an ISO string can raise a RangeError on data that
//     reached the table in the wrong shape.
//
// The `Reference:` digest below is the working half of the diagnosis: the thrown
// message names the table and carries PostgREST's own, and Vercel logs it beside
// the digest under a `[read]` prefix. That channel existed before and was
// unusable only because nothing ever threw.
//
// Note when testing: this renders on the client after hydration. The SSR shell
// is <html id="__next_error__">, so curl sees only "Internal Server Error" —
// check the boundary in a real browser.

export default function Error({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <div className="flex flex-col gap-6 pb-10">
      <header>
        {/* text-display, like every other page's h1. At text-2xl this sat 4px
            above a section heading, so the one thing on the page read as a
            subsection of nothing — two adjacent steps doing different jobs at
            almost the same size, which is the hierarchy failure the ramp exists
            to prevent. Display clamps down to 36px at narrow widths. */}
        <h1 className="page-title text-ink">
          This page could not be loaded
        </h1>
        <p className="mt-1 text-sm text-body">
          The rest of the app still works — the navigation above is unaffected.
        </p>
      </header>

      <div className="panel px-5 py-6">
        <p className="text-sm text-body">
          Cached market data could not be read. Nothing was lost: the stored
          prices, news and summaries are still there, and the next scheduled
          refresh will pick up where it left off.
        </p>

        {/* The message itself is redacted in production, so the digest is the
            only thing that ties this page to a line in the Vercel logs. */}
        {error.digest && (
          <p className="mt-3 font-mono text-xs text-muted">
            Reference: {error.digest}
          </p>
        )}

        <button
          type="button"
          // retry(), not reset(): in this Next version reset() only re-renders
          // the boundary's children without re-fetching, so after a failed
          // database read "Try again" rendered the same failure. retry()
          // re-fetches the segment, which is what the button promises.
          onClick={() => retry()}
          className="panel-control mt-5 px-4 py-2 text-sm font-semibold text-ink"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
