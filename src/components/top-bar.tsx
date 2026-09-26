"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { SHORTCUTS } from "@/components/keyboard-shortcuts";

// One drawing convention for every glyph in the product: 24x24 viewBox,
// currentColor stroke, round caps and joins, no fill. Nothing here is an icon
// package — three glyphs, authored to sit beside three labels.
//
// Stroke width takes the `active` flag rather than a fixed 1.5: DESIGN.md's
// own icon rule already names a 1.5-1.75px range, and until now every icon in
// the product sat at the bottom of it, so active and inactive nav items only
// ever differed by colour. 1.75 on the active icon is the range's own top
// end, not a new number — a second, non-colour channel for the one state the
// accent is already allowed to mark.
type IconProps = { active?: boolean };

// A jagged line — the same shape as the sparklines this page is full of, so
// the nav item looks like the thing it leads to (the whole market's
// movement) instead of a generic gauge or bar-chart mark.
function MarketIcon({ active }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 1.75 : 1.5} strokeLinecap="round" strokeLinejoin="round" className="size-[18px]" aria-hidden>
      <path d="M3 14 7 7 10 17 14 5 17 13 21 9" />
    </svg>
  );
}

// A simple table — a header row over two body rows — kept as the Stocks
// nav item's mark even though the item now routes straight to Today's
// Activity (a single stock's page) rather than a Top-20 table page.
function StocksIcon({ active }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 1.75 : 1.5} strokeLinecap="round" strokeLinejoin="round" className="size-[18px]" aria-hidden>
      <rect x="4.5" y="4.5" width="15" height="15" rx="1.5" />
      <path d="M4.5 9.5h15M9.5 9.5V19.5" />
    </svg>
  );
}

// A folded sheet with a headline rule over two body lines — the newspaper the
// product's own typography rule already reaches for ("a serif for the words
// against a grotesque for the instruments is the newspaper structure"), drawn
// rather than stated.
function NewsIcon({ active }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 1.75 : 1.5} strokeLinecap="round" strokeLinejoin="round" className="size-[18px]" aria-hidden>
      <rect x="4.5" y="4.5" width="15" height="15" rx="1.5" />
      <path d="M7.5 8.5h9M7.5 11.5h9M7.5 14.5h5.5" />
    </svg>
  );
}

const NAV_ITEMS = [
  { href: "/", label: "Market", icon: MarketIcon },
  // "Stocks" routes to Today's Activity, not a separate table page — the
  // owner's call after seeing the Top-20-table build: clicking Stocks
  // should land on a stock's own page (NVDA by default), same as the old
  // Today's Activity nav item did before the Market Story pivot.
  { href: "/todays-activity", label: "Stocks", icon: StocksIcon },
  { href: "/news", label: "News", icon: NewsIcon },
] as const;

// The shortcut list is imported rather than restated so the hint printed on a
// row and the key that actually navigates cannot drift apart — the same
// single-source reasoning the significance rule already gets.
const KEY_BY_HREF = new Map(SHORTCUTS.map((s) => [s.href, s.key]));

export function TopBar({ marker }: { marker?: ReactNode }) {
  const pathname = usePathname();

  return (
    // A <header> that is a direct child of <body> is the `banner` landmark.
    // The three per-page <header>s all live inside <main>, so they are not,
    // and there is no landmark collision to resolve.
    <header className="relative z-10">
      {/* The same card as the rail it replaces — `panel-rail`, not `panel`.
          That is not nostalgia: DESIGN.md sanctions exactly one surface
          resolving darker than `glass-panel`, and it is shell, on the grounds
          that shell should stay recessive while the page behind it changes.
          Turning the rail on its side does not change what it is, so the
          material, the blur and the elevation step all carry over untouched.

          Deliberately NOT sticky, which is a reversal of the rail's own
          behaviour rather than an omission. The rail could be sticky because
          content scrolled past its *side*: its backdrop held nothing but the
          fixed sky, so the blur never had to be recomputed. A pinned top card
          has content passing *underneath* it, which re-composites a 10px
          backdrop-filter on every scroll frame — the exact case The Bounded
          Motion Rule exists to forbid. `g h` / `g n` / `g a` already switch
          routes from any scroll position, which is what makes the loss
          affordable.

          No entrance animation either. This card is the frame, present from
          the first paint like the sky is; it sits outside `page-enter` exactly
          as the rail does today, which also keeps peak animation concurrency
          at three.

          flex-wrap is the guarantee that this card can never widen the page.
          Below the width where three labelled items fit on one line the nav
          wraps to a second row instead of overflowing — the same reflow the
          Today's Story header already uses.

          justify-between pushes the nav to the far end, which is the classic
          masthead split: the publication's name at one edge, the sections at
          the other. It is `justify-between` rather than `ml-auto` on the nav
          deliberately — below 600px the name is hidden, and a lone `ml-auto`
          child would still be shoved to the right edge with nothing opposite
          it, while `justify-between` with a single child simply left-aligns.
          The narrow case gets the right answer for free. */}
      <div className="panel-rail flex flex-wrap items-center justify-between gap-x-8 gap-y-2 px-4 py-2">
        {/* The product's name, on every route, for the first time, and the
            reason the card is not simply a strip of links. The rail
            gave it up when the wordmark moved to Home's masthead and recorded
            the consequence as a deliberate trade: News opens with "News" and
            Today's Story with a ticker, so a visitor landing on either had
            three nav items for orientation and nothing saying what this is.
            A card that is on screen everywhere makes the trade unnecessary.

            Source Serif 4 — the face Home's own masthead uses — so the
            nameplate speaks in the brand voice while the nav beside it speaks
            in the interface voice. That is the Written-And-Measured split
            applied to the two things sharing this row; set in Inter at the
            same weight it would read as a fourth nav item pushed slightly
            apart from the other three.

            Not a link. It would be a second control pointing at Home,
            competing with the nav item that already carries aria-current, and
            a nameplate is not a control.

            Hidden below 600px, which is where the row stops fitting on one
            line. Measured rather than estimated: 120px of wordmark + 32px gap
            + 349px of nav + 32px of card padding is 533px, against a content
            column of viewport − 48, so 600 clears it with 19px to spare and
            560 would not. The name is the half that can go, because the nav
            cannot. */}
        <span className="hidden shrink-0 px-2 font-serif text-base font-semibold tracking-tight text-ink min-[600px]:block">
          US TechMarket
        </span>

        {/* The session stamp — which day is on screen, how fresh it is, and
            whether the market is open — rendered by the server and handed down,
            because this file is a client component and may not read data.

            Where it sits is measured, not chosen. The three children need
            120px of nameplate + 32 gap + 368 of stamp + 32 gap + 349 of nav =
            901, plus 32 of card padding and 48 of shell, so one row costs
            981px of viewport — rounded up to a clean 1000. Below that the
            stamp takes a row of its own (w-full is what forces the wrap) and
            the card grows 62px -> 86px, or 102px below 600px where the stamp
            itself needs two lines. 950 was tried first, from an estimate of
            the stamp at ~300px rather than a measurement of it; at that width
            the nav wrapped instead and the card came out at 93px, which is the
            same cost paid for a worse arrangement.

            That second row is a composition rather than a fallback: the name
            with the date beneath it is what a masthead does, and it is the
            arrangement every newspaper reaches for at exactly the width where
            the two cannot sit side by side. The cost is 24px of chrome below
            950px, which is accepted here for one reason — after this change
            the shell is the only surface that always names the session, and an
            element that disappears on the narrowest screen is one nobody can
            rely on. */}
        {marker ? (
          <div className="order-last w-full min-[1000px]:order-none min-[1000px]:w-auto">
            {marker}
          </div>
        ) : null}

        {/* flex-wrap here as well as on the card, and it is not redundant:
            the nav is a single flex item of the card, so without it the three
            links have to fit one line whatever the card does.

            It is now the safety net rather than the phone behaviour. Dropping
            "Today's " below 600px is what keeps the card at one row and 62px
            down to 390px, where it used to wrap to two rows and 110px — 48px
            of permanent chrome returned on every route, on the axis a phone
            has least of. Below ~330px the items would wrap again, and should:
            degrading beats overflowing. */}
        <nav aria-label="Main" className="flex flex-wrap items-center gap-1">
          {NAV_ITEMS.map((item) => {
            const isActive =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
            const Icon = item.icon;
            const key = KEY_BY_HREF.get(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                // The shortcut is declared here and drawn nowhere. It WAS
                // printed on the row as muted mono — `g h`, `g n`, `g a` — and
                // that was removed on report: the owner read it as characters
                // somebody had forgotten to delete. Which is a fair reading.
                // Bare letters at the end of a nav row have no container, no
                // affordance and no punctuation saying "this is a key"; the
                // only thing marking them as different from the label is that
                // they are quieter, and quiet stray text reads as debris rather
                // than as an offer.
                //
                // The fix is not to shout. If it comes back it comes back as a
                // KEY — a plate with a border, sized and inset like a keycap —
                // because the shape is what carries the meaning, not the text.
                // Until then this attribute is the whole affordance: screen
                // readers announce it with the link, and the README documents
                // it for everyone else.
                aria-keyshortcuts={key ? `g ${key}` : undefined}
                // Active state was a plate plus a colour, neither of which a
                // screen reader reports.
                aria-current={isActive ? "page" : undefined}
                // The active plate was surface-strong — grey — so the accent was
                // carried by 14px of text alone and the navigation held no colour
                // at any time. A translucent plate, a lit ring and a soft glow make
                // the state a shape as well as a colour — see `nav-active` in
                // globals.css for why the label is primary-active rather than
                // primary, which fails at every alpha.
                //
                // The icon carries no colour decision of its own — stroke is
                // currentColor, so it is exactly as blue as the label beside it
                // and exactly as grey when it isn't. Nothing added a fourth
                // place the accent can appear.
                //
                // Hover is a translucent lift rather than the opaque
                // surface-soft plate: that token is baked over the panel canvas,
                // and a panel-coloured chip on this card read as a patch of the
                // wrong material sitting on the glass. It is the same blue-white
                // the glass rim is made of (--color-glass-lift), not plain
                // white — on a field this saturated, neutral white light reads
                // as grey paint smeared on the pane.
                // py-3, not py-2, and the reason is the iPad rather than the
                // laptop. These three rows are the product's whole navigation
                // and they measured 206x36 — legal under WCAG 2.2 AA, which
                // asks 24x24, but six pixels under the 44 a finger is drawn
                // against on a touch screen, on the one control a visitor has
                // to hit before they can do anything else. The card has the
                // room: it holds three items and a nameplate, so the height
                // comes out of slack rather than out of density. The dense
                // controls — table rows, dropdown rows, the picker pill — keep
                // their size; this is a navigation fix, not a blanket inflation
                // of a product that is meant to be read close.
                // whitespace-nowrap for the same reason the watchlist's
                // column headers carry it: a label naming a destination is an
                // identity, and the one thing in a row that should never
                // reflow. Measured at 390px without it, "Today's Story"
                // broke across two lines inside its own item and took the
                // whole card from 62px to 82px to do it.
                className={`flex items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-3 text-sm font-medium transition-colors ${
                  isActive
                    ? "nav-active text-primary-active"
                    : "text-body hover:bg-glass-lift hover:text-ink"
                }`}
              >
                <Icon active={isActive} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
