import { logoSrc } from "@/lib/logos";

// Fixed-width badge for every symbol so every row in a table/list lines up
// identically.
//
// `max-w-full` caps a wordmark at the plate's content width, and because the
// mark keeps its aspect ratio that cap sets its drawn *height* — so the wider
// the lockup, the smaller it renders. Measured at the sizes below: square
// symbols draw the full 16px, and the four wordmarks that do not fit come out
// at micron 15.4px, intuit 14.5px, Qualcomm 13.2px and servicenow 10.5px.
// That is why the padding here is `px-1` rather than `px-2` — the 8px it gives
// back is worth about a pixel of height on each of those four, and costs the
// square marks nothing since they are height-capped well before the width cap.
// servicenow at 6.9:1 is the weakest badge in the set and the one to revisit
// first if a legibility complaint comes back from the gate.
export function CompanyLogo({
  symbol,
  name,
  eager = false,
}: {
  symbol: string;
  name: string;
  /** Load immediately. For the marks that are above the fold on first paint. */
  eager?: boolean;
}) {
  const src = logoSrc(symbol);

  return (
    <span
      className={`flex h-8 w-20 shrink-0 items-center justify-center rounded-full px-1 ${
        // Real marks need the always-light plate: they are drawn in their own
        // brand colours and several are near-black, so a theme-aware surface
        // would swallow them in dark mode. The lettermark is plain text and
        // stays theme-aware.
        src ? "bg-logo-plate plate-object" : "bg-surface-strong plate-object-dark"
      }`}
      aria-hidden
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- remote CDN mark; Brandfetch requires these URLs be hotlinked, so next/image optimization (which refetches server-side) is not an option
        <img
          src={src}
          // NOT alt="". The empty string is what made an unreachable CDN a
          // SILENT total failure: a broken image with no alt collapses to
          // nothing, so every plate in the product went blank at once and the
          // page looked designed that way. It happens — it happened during a
          // working session, and the codebase records it as a known hole with
          // "adding a fallback would require an onError handler and so a client
          // component". It does not. A non-empty alt is rendered by the browser
          // in the image's place when the image fails, which is a lettermark
          // fallback with no JavaScript at all.
          //
          // The alt alone was not enough, and the measurement is why: a broken
          // image has an intrinsic width of ZERO, so under the old
          // `max-w-full` the box collapsed to 0x16 and the browser had nowhere
          // to draw the text. Verified against a genuinely dead host — the
          // first attempt pointed at a nonsense Brandfetch path and quietly
          // SUCCEEDED, because that CDN answers 200 with a placeholder for
          // anything, which is the same trap CLAUDE.md records for curl. With
          // `w-full` the box is the plate's full 72x16 and the ticker appears.
          //
          // `w-full` costs the loaded marks nothing. `object-contain` fits
          // within both axes, so a square symbol is still height-limited at
          // 16px and a 6.9:1 wordmark still width-limited at 72px — the same
          // drawn sizes the note above records.
          //
          // No accessibility cost: the plate above is `aria-hidden`, so the
          // whole subtree is out of the a11y tree whatever this string says,
          // and the symbol is already stated in the adjacent text. This alt is
          // for the eye, in one failure mode, and for nothing else.
          alt={symbol}
          // Same reasoning as news-thumbnail: the fixed h-8 w-20 plate already
          // reserves the box, so lazy loading costs no layout stability and
          // saves the CDN round trips for rows below the fold.
          //
          // Except for the rows that are not below the fold. The watchlist and
          // Top Movers are the first thing under Home's session band, and a
          // lazy request that starts after layout leaves an empty light pill
          // sitting where a brand mark should be for several hundred
          // milliseconds — on first paint, on the page a visitor judges the
          // product by. Sixty news thumbnails still pay for themselves lazily.
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          // The colour and size are for the alt text and are invisible while
          // the image loads. Without them the fallback inherits Ink on the
          // always-light plate — white on near-white, which is a silent failure
          // wearing a different hat. `backdrop` rather than a new token: it is
          // the darkest value the system has, it is already documented, and a
          // token invented for one failure mode is an abstraction nobody asked
          // for.
          className="h-4 w-full object-contain text-micro font-semibold text-backdrop"
        />
      ) : (
        <span className="text-micro font-semibold text-body">
          {name.slice(0, 2).toUpperCase()}
        </span>
      )}
    </span>
  );
}
