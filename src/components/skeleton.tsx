// The shape of a page, in the page's own material, while the server renders it.
//
// Every route here is `ƒ (Dynamic)` — each reads the watchlist cookie — so a
// navigation is a server round trip with nothing on screen until it lands. On a
// fast connection that is invisible; on a slow one the app looked frozen.
//
// DELIBERATELY STILL. The obvious thing to add is a shimmer, and this product
// is the wrong place for one: it already carries six authored motions, and a
// pulsing rectangle is the kind that means nothing. The skeleton is not trying
// to entertain during a wait — it is answering "is this page coming, and what
// will be in it", and an empty pane at the right size and position answers both
// on the first frame. What it must NOT do is imply that data is arriving in
// pieces; nothing here streams.
//
// `aria-hidden` throughout, with the announcement made once by the region that
// holds them, so a screen reader hears "Loading" rather than a list of boxes.

// An EMPTY panel does not read as a panel. Measured on the first paint of a
// real navigation: glass at 0.34 alpha over near-black sky, with a 7% rim, is
// almost invisible until something sits inside it — this material is legible
// because of its content, not instead of it. The first version of this file
// shipped bare panels and the loading state looked like an empty page rather
// than an arriving one, which is the opposite of the job.
//
// So each panel carries a few bars at the sizes its real content uses. They are
// `surface-soft` — the token baked over the panel canvas, correct INSIDE a
// panel, where a translucent tint would break the One Translucent Layer Rule.
export function SkeletonPanel({
  className = "",
  lines = 3,
  enter,
}: {
  className?: string;
  lines?: number;
  // The beat of the card it stands in for, so the page can take over its
  // arrival mid-rise (`page-entrance.tsx`).
  enter?: string;
}) {
  // Descending widths, because content is ragged and a stack of equal bars
  // reads as a graphic. Deterministic, so the skeleton never flickers between
  // renders.
  const widths = ["58%", "84%", "40%", "72%", "50%"];

  return (
    <div className={`panel flex flex-col justify-center gap-3 p-5 ${className}`} aria-hidden data-enter={enter}>
      {Array.from({ length: lines }, (_, i) => (
        <span
          key={i}
          className="block h-3 rounded-full bg-surface-soft"
          style={{ width: widths[i % widths.length] }}
        />
      ))}
    </div>
  );
}

export function SkeletonPage({ children }: { children: React.ReactNode }) {
  return (
    // `page-enter`: the arrival starts here, the moment the link is pressed,
    // and the page that replaces this carries it on (`page-entrance.tsx`).
    <div className="page-enter flex flex-col gap-10 pb-10" role="status" aria-busy>
      <span className="sr-only">Loading</span>
      {children}
    </div>
  );
}
