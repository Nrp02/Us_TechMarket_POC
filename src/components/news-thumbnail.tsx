import { FINNHUB_LOGO, logoSrc } from "@/lib/logos";

// Thumbnails are always a mark, never article photography: the company's logo
// for a per-symbol article, and the data provider's mark for market news, which
// belongs to no single company.
//
// All 43 tracked stocks share the same logo mapping and plate treatment.
//
// Note it does *not* cover the failure that can actually happen: an unreachable
// CDN resolves to an empty plate, because that is an image that fails to load
// rather than a null src, and catching it would need an onError handler and so
// a client component.
//
// Finnhub's image field is not used. It supplied an image for nearly every
// article, but only 10 distinct URLs across 90 articles — 69 sharing one Yahoo
// Finance placeholder and 13 the Reuters publisher logo — so the page rendered
// the same two pictures over and over. Dropping images also removes the need
// for a client-side onError fallback, leaving this a server component.

// One fixed-width plate for every state so every thumbnail in the list lines up
// identically. `max-w-full` on the mark lets a wide wordmark scale down rather
// than spill past the plate.
// Was 176x80 with a 36px mark — at an iPad-portrait width that plate took about
// 40% of the row for an aria-hidden decoration, and on the Market tab it was the
// same Finnhub mark repeated 19 times down the page. At 96x44 it identifies the
// source without dominating the headline it sits beside, and it now shares the
// pill geometry every other logo plate in the product uses.
const PLATE = "flex h-11 w-24 shrink-0 items-center justify-center rounded-full px-2";
// Real marks get the always-light plate (they are drawn in their own brand
// colours and several are near-black); the lettermark stays theme-aware.
const LOGO_PLATE = `${PLATE} bg-logo-plate`;
const TEXT_PLATE = `${PLATE} bg-surface-strong`;

export function NewsThumbnail({ symbol }: { symbol: string | null }) {
  // Market news carries no tickers at all — that is how the category is
  // identified — so a null symbol is exactly the market case.
  const src = symbol ? logoSrc(symbol) : FINNHUB_LOGO;

  if (src) {
    return (
      <span className={LOGO_PLATE} aria-hidden>
        {/* eslint-disable-next-line @next/next/no-img-element -- remote CDN mark; Brandfetch requires these URLs be hotlinked, so next/image optimization (which refetches server-side) is not an option */}
        <img
          src={src}
          // See company-logo.tsx: a non-empty alt is the CDN fallback, drawn by
          // the browser when the mark fails and free the rest of the time. The
          // plate is `aria-hidden`, so nothing here reaches a screen reader.
          // Market news has no symbol, so it falls back to the provider's name
          // rather than to a blank plate.
          alt={symbol ?? "Finnhub"}
          // The News page renders up to 60 rows, so this one line was opening
          // 60 concurrent CDN connections on every visit, the great majority of
          // them below the fold, and drawing down the 500k/month Brandfetch
          // allowance about five times faster than the page needs to. No layout
          // cost either way: the plate's fixed h-11 w-24 already reserves the
          // box, so there was never CLS to trade against.
          loading="lazy"
          decoding="async"
          className="h-5 w-full object-contain text-micro font-semibold text-backdrop"
        />
      </span>
    );
  }

  return (
    <span className={TEXT_PLATE} aria-hidden>
      <span className="text-sm font-semibold text-body">{symbol}</span>
    </span>
  );
}
