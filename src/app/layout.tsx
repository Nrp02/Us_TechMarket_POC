import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Analytics } from "@vercel/analytics/next";
import { Inter, JetBrains_Mono, Source_Serif_4 } from "next/font/google";
import { ChartGradients } from "@/components/chart-gradients";
import { KeyboardShortcuts } from "@/components/keyboard-shortcuts";
import { Meteors } from "@/components/meteors";
import { NightSky } from "@/components/night-sky";
import { PageEntrance } from "@/components/page-entrance";
import { SaturnScene } from "@/components/saturn-scene";
import { SessionMarker } from "@/components/session-marker";
import { SkyInteraction } from "@/components/sky-interaction";
import { TopBar } from "@/components/top-bar";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

// Every numeric value renders in mono, per the design system.
//
// The fallback is the platform's own monospace, not next/font's adjusted Arial:
// that one is scaled on average letter width, so its digits ran 16% wider
// than JetBrains Mono's ("$233.95" 142px against 122px at 390). On a phone the
// Normal badge wrapped under the price until the font arrived, then jumped back
// up, the whole of the Stocks page's 0.108 CLS. Monospaced faces share the
// 0.6em advance, so the swap no longer changes a line break.
const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  adjustFontFallback: false,
  fallback: ["ui-monospace", "Menlo", "Consolas", "monospace"],
});

// The editorial voice, and the answer to a fair complaint that the product
// looked like every other dashboard. Inter is the most common UI face on the
// web; DESIGN.md described the pairing as having "no stylistic opinion", which
// for a portfolio piece is a weakness rather than restraint.
//
// The reasoning is about what this product *is*. It does not trade, does not
// tick, and does not advise — its output is written prose, a daily narrative
// and summarised news. It is far closer to a financial paper's evening edition
// than to a terminal, and terminal typography would misrepresent it by
// implying something is still moving. A serif for the words and a grotesque for
// the instruments is the newspaper structure, and it says "read, edited,
// considered" — which is exactly this product's claim and precisely what a
// competitor optimising for confident prediction cannot say.
//
// Source Serif 4 rather than a fashionable display serif: it is drawn for
// reading on screens, it is sober rather than mannered, and it will not look
// dated in a year. Variable, so the whole 200-900 range costs one file.
const sourceSerif = Source_Serif_4({
  variable: "--font-source-serif",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  // Without this the OG image resolves against http://localhost:3000, which the
  // production build warns about and which would have shipped a link preview
  // that works on nobody's machine but this one — on the single surface the
  // card exists for. PRODUCT.md records the deployment; Vercel's own variable
  // wins when it is present so a preview deployment previews itself.
  metadataBase: new URL(
    process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "https://ustechmarket.vercel.app",
  ),
  // A template, so every route that sets a title inherits the product name
  // rather than repeating the string. `default` is what Home and any route
  // without its own title falls back to.
  title: {
    default: "US TechMarket",
    template: "%s · US TechMarket",
  },
  description: "Daily AI intelligence for US Technology stocks.",
};

// The browser draws a strip of chrome above this page and it was arriving in
// the user agent's own grey, on a product otherwise controlled down to the
// hairline — the same class of oversight as an unthemed scrollbar, which this
// codebase already fixed. --color-backdrop, so the sky simply continues past
// the top of the document.
//
// The favicon it sits beside was Next's default logo until now: the product
// was demoed live and shared as a link with somebody else's mark in the tab.
// See `icon.svg` for why the replacement is the sky rather than a logo.
export const viewport: Viewport = {
  themeColor: "#01040c",
};

// There is one theme. The pre-paint script that used to sit here read a stored
// "light" preference and rewrote data-theme before hydration; with light mode
// dropped it has nothing to decide, so the script, the attribute and the
// suppressHydrationWarning it required are all gone rather than left inert.
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${jetbrainsMono.variable} ${sourceSerif.variable} h-full antialiased`}
    >
      <body className="flex min-h-full justify-center">
        {/* The sky sits behind everything, fixed, at z-index -1 — inside the
            root stacking context so every backdrop-filter above it has
            something to sample. It is the first child so it paints first. */}
        <NightSky />
        {/* Sits beside the sky rather than inside it: `NightSky` is a server
            component and must stay one — 313 stars and two fractal filters have
            no business shipping to the client — while the meteors need to know
            when a navigation happened. Two layers, one world. */}
        {/* The pointer glow and the constellations, over the stars at the
            same depth, still behind every panel. */}
        <SkyInteraction />
        {/* After the stars and the pointer glow, so the planet is in front of
            them, and still behind every panel. */}
        <SaturnScene />
        {/* Last of the sky's layers: a meteor burns up in our own air, so it
            crosses in front of the planet, never behind it. Still behind
            every panel. */}
        <Meteors />
        {/* The nav is only 3 items, so this costs little on most visits —
            but it was still missing, on a codebase that otherwise author its
            own a11y fixes rather than skip them. First focusable element in
            the document, invisible until it receives focus. It matters more
            now than it did: the nav card sits above <main> in reading order
            rather than beside it. */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-primary-fill focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
        >
          Skip to content
        </a>
        {/* One shell, one set of gutters. The page used to compose its margins
            from three unrelated sources — the rail's own px-4, each page
            container's px-6/lg:px-10, and an mx-auto centring a 1200px column
            inside a <main> that the sidebar had already pushed off-centre. The
            three never agreed: measured at 1470px the viewport-to-rail gap was
            16px, rail-to-content 56px and content-to-viewport 40px, and at
            1920px they diverged to 16 / 280 / 264.

            Now the whole app is one centred group with uniform p-6, and the
            gap between the nav card and the content below it is the same 24px
            as the margin outside them. Pages carry no horizontal padding of
            their own at all.

            The cap moved from a 1200px content column to a 1680px group, which
            is what actually widens the content: 1118px -> 1158px at 1470, and
            1120px -> 1368px at 1920, where a quarter of the screen was being
            spent on symmetrical emptiness.

            The group stacks rather than sitting side by side, because the
            navigation moved out of a 240px left rail and into a card across
            the top. Content is 264px wider on every route as a direct result
            — 240 of rail plus the 24 gap it needed — and every breakpoint in
            the product that was derived from the shell arithmetic moved with
            it. The cost is the other way round: ~84px of vertical chrome that
            did not exist before, on a laptop where vertical space is the
            scarcer of the two. */}
        {/* The phone tier: 16px of gutter and gap below 600px, 24px above it.
            The shell still owns every gutter — this is one more value in the
            one place that sets them, not a page reclaiming its own margins.

            24px of padding is 12.3% of a 390px screen spent on emptiness, on
            the axis a phone has least of. Dropping to 16 returns 16px to the
            content column (342 -> 358), which is what lets the nav card hold
            its three items on one row and the watchlist rows carry a badge and
            a sparkline on the same line. 600px is the product's phone line
            already — it is where the nameplate hides — so this pass adds a
            tier at a breakpoint that exists rather than a fourth number. */}
        <div className="flex w-full max-w-[1680px] flex-col gap-4 p-4 min-[600px]:gap-6 min-[600px]:p-6">
          {/* The marker is passed in rather than imported by TopBar, which is a
              client component: a server component can be handed down as a
              prop, it cannot be rendered from inside one.

              Suspense, so this layout stays synchronous. Awaiting the query
              here would hold the whole shell — nav card included — behind a
              database round trip on every route, and the fast shell-then-
              skeleton first paint is the thing that makes the app feel
              instant. The fallback reserves the stamp's width so the nav does
              not jump sideways when it resolves. */}
          <TopBar
            marker={
              <Suspense
                fallback={
                  <span aria-hidden className="block h-4 w-[300px] max-w-full" />
                }
              >
                <SessionMarker />
              </Suspense>
            }
          />
          {/* min-w-0 is load-bearing, not tidying. A flex item defaults to
              min-width:auto, so without it <main> cannot shrink below its
              content's min-content width — the watchlist table and the 560px
              intraday chart would push the whole page sideways instead of
              scrolling inside their own overflow-x-auto wrappers. It survives
              the switch to a column: the axis changed, the default did not. */}
          <main id="main-content" tabIndex={-1} className="min-w-0">
            {children}
          </main>
        </div>
        <ChartGradients />
        <Analytics />
        {/* Renders nothing. It is here rather than in the nav card because
            the shortcuts are a property of the document, and the card is a
            component that could stop existing at a narrower width. */}
        <KeyboardShortcuts />
        {/* Renders nothing: a page replacing its skeleton carries on the
            skeleton's entrance instead of starting another. */}
        <PageEntrance />
      </body>
    </html>
  );
}
