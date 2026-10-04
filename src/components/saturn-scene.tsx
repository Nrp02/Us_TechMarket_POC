import { RING_OUTER, RING_STOPS, SATURN_R } from "@/components/saturn-profile";
import { SaturnStage } from "@/components/saturn-stage";

// A planet in the room's window: Saturn, low on the right and cropped by the
// frame, behind every pane. Decoration only — it carries no figure, no label
// and no state, takes no input, and is hidden from the accessibility tree.
//
// This is the drawn planet, and it is the FALLBACK: it is shown only when the
// 3D render cannot run — no WebGL context, a lost one, or a device that cannot
// hold the frame rate (`data-three="off"`, set by `saturn-stage.tsx`). It is
// not the first paint: until the render's first frame there is no planet, and
// then the render fades in. Drawing this first and swapping would show two
// different planets in the first second. The two share their geometry and
// ring profile through `saturn-profile.ts`, their colours through the
// `--saturn-*` tokens, and each route's tilt and roll through
// `--saturn-tilt` / `--saturn-roll` (applied here in CSS, see
// `saturn-ring-plane` in globals.css).
//
// --- Colour ----------------------------------------------------------------
//
// Natural, not blue: cream, muted gold and tan on the body, grey at the
// poles, ivory and grey-silver in the rings. The only blue is a very thin
// cool rim on the night limb, which is the glass below reflecting back up at
// it. Blue stays the panes'.
//
// --- Why it is this dim ----------------------------------------------------
//
// The panes are clear glass at 0.34 alpha, so whatever sits behind one is two
// thirds of the face its text is read on. The drawing cannot know which of
// its pixels are behind a pane, so all of it is drawn at `--saturn-glass` of
// the tokens' brightness (the `saturn-art` opacity). The 3D render knows
// where the panes are and is dim only behind them.
//
// --- Geometry --------------------------------------------------------------
//
// viewBox 1000, centred on the planet. The ring system keeps Saturn's own
// proportions against the body (C from 1.24 radii, B to 1.95, the Cassini
// division, A out to 2.27). The ring plane's tilt and the roll are the
// route's, applied in CSS; the cloud bands are drawn for an 11 degree tilt
// (sin = 0.19), which is close enough for every route's.
const R = SATURN_R;
const RING = R * RING_OUTER;
const OPEN = 0.19;
const OPEN_COS = 0.982;

// Cloud bands, as lines of latitude seen from above the ring plane: each is
// the near half of an ellipse, so the banding curves with the globe instead
// of lying flat across a disc. [latitude in degrees, stroke width, tone,
// opacity]. Cream lightens, tan darkens; the gold underneath is what the two
// leave between them.
const BANDS: [number, number, "light" | "dark", number][] = [
  [66, 46, "dark", 0.6],
  [47, 16, "light", 0.4],
  [36, 12, "dark", 0.5],
  [24, 22, "light", 0.5],
  [10, 9, "dark", 0.45],
  [-2, 26, "light", 0.4],
  [-17, 13, "dark", 0.55],
  [-29, 18, "light", 0.35],
  [-43, 20, "dark", 0.5],
  [-60, 30, "dark", 0.6],
];

function bandPath(lat: number) {
  const phi = (lat * Math.PI) / 180;
  const rx = R * Math.cos(phi);
  const cy = -R * Math.sin(phi) * OPEN_COS;
  return `M ${(-rx).toFixed(1)} ${cy.toFixed(1)} A ${rx.toFixed(1)} ${(rx * OPEN).toFixed(1)} 0 0 0 ${rx.toFixed(1)} ${cy.toFixed(1)}`;
}

// One half of the ring system. Drawn as a circle in the ring's own plane and
// flattened by the group around it, so the radial gradient that carries the
// C, B and A rings and the gaps between them flattens with it.
function RingHalf({ half }: { half: "far" | "near" }) {
  return (
    <g className="saturn-ring-plane">
      <circle r={RING} fill="url(#saturn-rings)" clipPath={`url(#saturn-ring-${half})`} />
    </g>
  );
}

export function SaturnScene() {
  return (
    <SaturnStage>
      <svg viewBox="0 0 1000 1000" className="size-full" focusable="false">
        <defs>
          <radialGradient id="saturn-rings" gradientUnits="userSpaceOnUse" cx="0" cy="0" r={RING}>
            {RING_STOPS.map(([r, opacity, tone]) => (
              <stop
                key={r}
                offset={(r / RING_OUTER).toFixed(4)}
                stopColor={tone >= 0.5 ? "var(--saturn-ring)" : "var(--saturn-ring-cool)"}
                stopOpacity={opacity}
              />
            ))}
          </radialGradient>

          {/* In the ring's own plane, before the squash: the far half is the
              upper one, the near half the lower. */}
          <clipPath id="saturn-ring-far">
            <rect x={-RING} y={-RING} width={RING * 2} height={RING} />
          </clipPath>
          <clipPath id="saturn-ring-near">
            <rect x={-RING} y="0" width={RING * 2} height={RING} />
          </clipPath>

          {/* The body's shadow across the rings: half an ellipse as wide as
              the planet, pointing away from the light — to the right and very
              slightly forward. Drawn in the plane and flattened with the
              rings. */}
          <mask id="saturn-ring-shadow" maskUnits="userSpaceOnUse" x="-500" y="-500" width="1000" height="1000">
            <rect x="-500" y="-500" width="1000" height="1000" fill="#fff" />
            <g className="saturn-ring-plane">
              <path d={`M 0 ${-R} A ${R * 1.95} ${R} 0 0 1 0 ${R} Z`} fill="#000" fillOpacity="0.93" transform="rotate(7)" />
            </g>
          </mask>

          <clipPath id="saturn-disc">
            <circle r={R} />
          </clipPath>

          {/* Day into night. Lit from the upper left and a little behind, so
              the terminator runs close to the middle of the disc. */}
          <radialGradient id="saturn-night" gradientUnits="userSpaceOnUse" cx="-190" cy="-100" r="430">
            <stop offset="0" stopColor="var(--saturn-shadow)" stopOpacity="0" />
            <stop offset="0.3" stopColor="var(--saturn-shadow)" stopOpacity="0.08" />
            <stop offset="0.55" stopColor="var(--saturn-shadow)" stopOpacity="0.38" />
            <stop offset="0.8" stopColor="var(--saturn-shadow)" stopOpacity="0.76" />
            <stop offset="1" stopColor="var(--saturn-shadow)" stopOpacity="0.84" />
          </radialGradient>

          <radialGradient id="saturn-halo" gradientUnits="userSpaceOnUse" cx="-30" cy="-22" r="330">
            <stop offset="0.6" stopColor="var(--saturn-glow)" stopOpacity="0.05" />
            <stop offset="1" stopColor="var(--saturn-glow)" stopOpacity="0" />
          </radialGradient>

          <linearGradient id="saturn-limb" gradientUnits="userSpaceOnUse" x1="-18" y1="-208" x2="-208" y2="18">
            <stop offset="0" stopColor="var(--saturn-glow)" stopOpacity="0" />
            <stop offset="0.45" stopColor="var(--saturn-glow)" stopOpacity="0.4" />
            <stop offset="1" stopColor="var(--saturn-glow)" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="saturn-rim" gradientUnits="userSpaceOnUse" x1="36" y1="206" x2="209" y2="0">
            <stop offset="0" stopColor="var(--color-primary)" stopOpacity="0" />
            <stop offset="0.55" stopColor="var(--color-primary)" stopOpacity="0.2" />
            <stop offset="1" stopColor="var(--color-primary)" stopOpacity="0" />
          </linearGradient>
        </defs>

        <g transform="translate(500 500)">
          <g className="saturn-art">
            <circle r="330" fill="url(#saturn-halo)" />
            <g mask="url(#saturn-ring-shadow)">
              <RingHalf half="far" />
            </g>
          </g>

          {/* The planet is a body, not a tint: this disc is always opaque, so
              no star or cloud shows through it however far a route dims the
              artwork above. `sky-interaction.tsx` reads its box and treats
              the stars behind it as covered. */}
          <circle r={R} fill="var(--color-backdrop)" data-sky-occluder />

          <g className="saturn-art">
            <g clipPath="url(#saturn-disc)">
              <circle r={R} fill="var(--saturn-gold)" />
              {/* The invisible disc centres this group's box on the planet, so
                  the CSS roll turns it about the planet's centre. */}
              <g className="saturn-roll" fill="none">
                <circle r={R} />
                {BANDS.map(([lat, width, tone, opacity]) => (
                  <path
                    key={lat}
                    d={bandPath(lat)}
                    stroke={tone === "light" ? "var(--saturn-cream)" : "var(--saturn-tan)"}
                    strokeWidth={width}
                    strokeOpacity={opacity}
                  />
                ))}
                {/* The rings' shadow on the globe: the light is higher over
                    the ring plane than the viewer is, so it falls below
                    where the near ring crosses. */}
                <path d="M -372 0 A 372 150 0 0 0 372 0" stroke="var(--saturn-shadow)" strokeWidth="30" strokeOpacity="0.4" />
              </g>
              <circle r={R} fill="url(#saturn-night)" />
            </g>

            <path d="M -208.2 18.2 A 209 209 0 0 1 -18.2 -208.2" fill="none" stroke="url(#saturn-limb)" strokeWidth="1.6" />
            <path d="M 209 0 A 209 209 0 0 1 36.3 205.8" fill="none" stroke="url(#saturn-rim)" strokeWidth="1.4" />

            <g mask="url(#saturn-ring-shadow)">
              <RingHalf half="near" />
            </g>
          </g>
        </g>
      </svg>
    </SaturnStage>
  );
}
