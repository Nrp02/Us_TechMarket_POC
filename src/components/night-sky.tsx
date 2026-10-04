import type { CSSProperties } from "react";

import { BRIGHT, DIM, DUST, FAR } from "@/components/sky-field";

// The page's own atmosphere: one fixed layer behind everything, holding a
// silver starfield over near-black space. Saturn (`saturn-scene.tsx`) is the
// one object in it.
//
// Server-rendered inline SVG, and deliberately not a client component. The
// product's rule is that nothing renders on the client for a purely visual
// gain, and a night sky is the purest possible case of that. No canvas, no
// image request, no runtime randomness — the star coordinates below are
// literals, so the sky is byte-identical on every render and can be
// hand-tuned.
//
// The room moves; the data does not. The bright stars breathe, three depth
// layers sway on one slow period (see "Depth" below), and meteors and the
// pointer effects in `meteors.tsx` / `sky-interaction.tsx` cross it. The rule
// that governs all of it: **nothing that carries information may move, and
// the room may.** See `star-breathe` in globals.css for the two constraints
// that keep the breathing honest: it only ever dims below each star's own
// base, and it is confined to the bright tier.
//
// --- Weight ---------------------------------------------------------------
//
// This sky used to carry five masses of blue fractal cloud and every star at
// a radius that made it read through clear glass. With a lit planet as the
// focal object, both competed with it: the clouds were a second subject and
// the stars, at 2-5px through every pane, read as dust or snow. So the
// weather is gone — the backdrop is black — and the stars are drawn as
// points: half the dust and half the dim tier, at 40% and 34% of the radii
// they were placed at, and the bright tier at 36% (five of them larger on a
// tablet or desktop; see `star-lit` in globals.css). The positions are the
// authored ones; only the weight changed. Losing the clouds also loses the
// two feTurbulence filters, which were the expensive part of the sky.
//
// Points alone left the sky flat, so the depth is back as a far field of
// sub-pixel points (FAR, below) rather than as weather. The tiers now run
// from many to few: hundreds of far points, a hundred-odd dust, fifty-odd
// dim stars, eighteen bright ones.

// Shared by every star SVG layer so each one crops exactly like the others.
// `slice` scales the field to cover the viewport and crops the excess, so
// stars stay round at every aspect ratio; `none` would stretch them into
// ellipses on a wide laptop.
const SVG_FRAME = {
  viewBox: "0 0 1600 1000",
  preserveAspectRatio: "xMidYMid slice",
  className: "size-full",
  focusable: "false",
} as const;

// --- Depth ----------------------------------------------------------------
// The sky is a stack of layers at three depths, each its own element so it can
// be moved as a compositor transform without re-rasterising anything:
//
//   far   — the far field and the dust stars           (depth-far)
//   mid   — the dim stars                              (depth-mid)
//   near  — the bright stars, which also twinkle       (depth-near)
//
// All three depths sway on one shared period and differ only in how far they
// travel — the nearer, the further. That ratio is what the eye reads as depth:
// one slow camera drifting past a field, rather than three layers moving
// independently. The sizes and brightnesses that separate the tiers (dust the
// faintest and smallest, bright the only ones with a halo) are the other half
// of the cue. See `depth-*` in globals.css for the amounts and what stops them.
export function NightSky() {
  return (
    <div className="night-sky" aria-hidden>
      {/* Silver, not blue-white: a neutral, faintly cool metal that stays
          apart from the planet's warm cream and from the panes' blue. */}
      <div className="sky-layer depth-far">
        <svg {...SVG_FRAME}>
          <g fill="#c9d0dc">
            {FAR.map(([cx, cy, r, o], i) => (
              <circle key={`f${i}`} cx={cx} cy={cy} r={r} opacity={o} />
            ))}
            {DUST.map(([cx, cy, r, o], i) => (
              <circle key={i} cx={cx} cy={cy} r={r} opacity={o} />
            ))}
          </g>
        </svg>
      </div>

      <div className="sky-layer depth-mid">
        <svg {...SVG_FRAME}>
          <g fill="#dde3ec">
            {DIM.map(([cx, cy, r, o], i) => (
              <circle key={i} cx={cx} cy={cy} r={r} opacity={o} />
            ))}
          </g>
        </svg>
      </div>

      {/* The bright stars are HTML rather than SVG, and that is the whole
          performance story of the twinkle. It used to animate the opacity of
          <g> elements INSIDE the sky's one cached SVG, and an SVG group is not
          composited on its own — every cycle dirtied the shared layer and threw
          its texture away, continuously, which is why the twinkle had to be
          switched off on A14 hardware. As eighteen small elements, each opacity
          change is applied by the compositor to a texture it already holds.

          `sky-slice` reproduces `xMidYMid slice` in CSS — a 16:10 box that
          covers the sky and is centred on it — so a star at viewBox (x, y)
          lands on the same pixel it did in the SVG. Sizes are in `cqw`
          against that box: 1cqw is 16 viewBox units.

          Each star is its core and its halo drawn as one radial gradient: a
          solid core of radius r at the star's opacity, and a tight halo out
          to 4r. A wider one (it was 6r) made the larger stars read as round
          lamps rather than as points of light. */}
      <div className="sky-layer depth-near">
        <div className="sky-slice">
          {BRIGHT.map(([cx, cy, r, o], i) => (
            // Cycle length and phase are derived from the index rather than
            // randomised, so the sky stays byte-identical between renders like
            // every other value in this file. 6.2s to 11.6s, and a NEGATIVE
            // delay so each star starts part-way through its own cycle — with
            // positive delays they would all begin dark together on the first
            // paint, which is the one moment a visitor is looking.
            <span
              key={i}
              className={i % 4 === 0 ? "sky-star star-breathe star-lit" : "sky-star star-breathe"}
              style={{
                left: `${(cx / 1600) * 100}%`,
                top: `${(cy / 1000) * 100}%`,
                width: `${(r * 8) / 16}cqw`,
                height: `${(r * 8) / 16}cqw`,
                background: `radial-gradient(circle closest-side, rgb(244 246 250 / ${o}) 0 25%, rgb(231 235 242 / ${(0.2 * o).toFixed(3)}) 25%, rgb(231 235 242 / 0) 100%)`,
                "--star-dur": `${6.2 + (i % 7) * 0.9}s`,
                "--star-delay": `-${(i * 1.37).toFixed(2)}s`,
              } as CSSProperties}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
