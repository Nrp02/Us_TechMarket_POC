import {
  CanvasTexture,
  DoubleSide,
  Group,
  LinearFilter,
  Mesh,
  OrthographicCamera,
  PlaneGeometry,
  RingGeometry,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  Vector2,
  Vector3,
  Vector4,
  WebGLRenderer,
} from "three";

import { watchPageRest } from "@/components/page-rest";
import {
  RING_OUTER,
  RING_STOPS,
  SATURN_LIGHT,
  SATURN_R,
  SATURN_ROLL_DEG,
  SATURN_TILT_DEG,
} from "@/components/saturn-profile";

// The planet as a lit sphere and a ring plane, drawn in real time: the globe
// turns under its bands, the rings' shadow lies across it, its own shadow
// crosses the far ring, and the ring particles orbit — the inner ones faster
// than the outer.
//
// Loaded on demand by `saturn-stage.tsx` and never on the server: this file is
// the only importer of three.js, so the library is one lazy chunk. The drawn
// planet in `saturn-scene.tsx` is the fallback for when this cannot run.
//
// SAME GEOMETRY AS THE DRAWING, on purpose. The camera is orthographic over
// the SVG's own 1000-unit box and every dimension comes from
// `saturn-profile.ts`, so the fallback stands where the render would, and the
// opaque disc `sky-interaction.tsx` reads for star cover is where the body is.
//
// BRIGHT IN THE OPEN, DIM BEHIND CONTENT. The colours are read from the
// `--saturn-*` tokens and written to the screen without a colour-space pass,
// so a pixel here is the value the token says. Those values are a naturally
// lit planet, which is far brighter than the sky any pane was measured over,
// so it is dimmed in two steps, from a mask of the page drawn behind it:
// behind a pane to `--saturn-pane` of its brightness, and close around
// anything that is read — a line of text, a figure, a sparkline, a control,
// inside a pane or not — to `--saturn-glass`. A route that wants the planet
// to stand behind its panes sets the first step high and the planet carries
// through the glass; only the words and numbers get the dark ground they
// were measured on. See `collectShade`, and the contrast note at
// --saturn-glass in globals.css.
//
// WHAT MOVES. The globe turns once in `SPIN_S`. The rings are not a disc: the
// plane is cut into narrow lanes, each orbiting at the Kepler rate for its
// radius (period proportional to r^1.5, matching the globe at the
// synchronous orbit, 1.86 radii) and carrying its own clumps, streaks and
// thin patches, blended across lane edges so no seam shows. Over a few
// seconds the near side is seen running one way and the far side the other,
// the inner ring outrunning the outer. The plane itself never turns — only
// what is in it does.
//
// COST. One draw of two meshes at 30 frames a second or fewer, into a buffer
// capped per tier. Nothing is drawn while the tab is hidden or an overlay
// menu is open, and a device that cannot keep up is handed the drawn planet.

const R = SATURN_R;
const RAD = Math.PI / 180;
const SPIN_S = 75;
// The look of the light and the material, chosen against the real pages
// (prototype B, 2026-10-03): a hard terminator with almost no fill, so the
// planet reads as a lit solid; storms and patches drawn at nearly twice their
// first strength so the turning globe is visible within seconds; and ring
// clumps strong enough that the orbiting material, not just the planet, is
// seen to move.
const AMBIENT = 0.03;
const TERMINATOR: [number, number] = [-0.1, 0.5];
const DETAIL = 1.8;
const CLUMP = 0.9;
// The warm light around the planet at its brightest, just off the limb, as a
// share of --saturn-glow: about 25 units over black.
const HAZE = 0.11;
// A pane's shade reaches this far past its edge at full strength, then fades
// over its feather. The reach is more than half the 24px gutter, so the gaps
// in a card grid stay closed rather than lighting up as a grid of bright
// lines. Text is shaded tighter: its own box and a margin, fading over about
// two line heights, so the planet is dark under the words and not across the
// whole card.
const PANE_SHADE = { reach: 14, feather: 80 };
const TEXT_SHADE = { reach: 10, feather: 40 };
// What is read on the open field is shaded deeper (--saturn-bare), so its
// shade fades over a wider margin: tight, it reads as a dark patch cut into
// the planet's lit limb; wide, as a soft shadow.
const BARE_SHADE = { reach: 10, feather: 76 };
// The mask is drawn at a quarter of the viewport's resolution — the shade is
// soft by design, and sampling it with linear filtering smooths it further.
// Each feather is a Gaussian (a canvas shadow), not a stack of nested
// rectangles: over the planet's bright limb the steps of a stack read as a
// dark box cut into the body.
const MASK_SCALE = 0.25;
// How long new shade takes to fade in (`SHADE` drops shade that is no longer
// wanted at once). A route change used to empty <main> for a few frames
// between the old page and the new one, and the planet flashed to full
// brightness and back; no route does now (measured 2026-10-04), and the
// next page's shade fades in rather than snapping back.
const MASK_FADE_MS = 350;
// Far enough off the canvas that the shape itself is never drawn, only its
// shadow, which is offset back into place.
const OFFSCREEN = 100000;

// Everything that is glass, and so has text on it. The same list
// `sky-interaction.tsx` keeps stars out from under.
const PANES =
  ".panel,.panel-raised,.panel-rail,.panel-overlay,.panel-control,.panel-track,.panel-track-block,.panel-chip";
const OBJECTS = 'img,svg,button,a,input,select,textarea,summary,[role="img"]';

export type SaturnTier = "desktop" | "tablet";

// Longest side of the drawing buffer, the pixel-ratio cap, frames a second
// and noise octaves. The box is up to 1500 CSS px, and a 2x buffer of that is
// nine million fragments for a background.
const TIERS: Record<SaturnTier, { buffer: number; ratio: number; fps: number; octaves: number }> = {
  desktop: { buffer: 1800, ratio: 2, fps: 30, octaves: 4 },
  tablet: { buffer: 1400, ratio: 1.5, fps: 30, octaves: 4 },
};


const f = (n: number) => (Number.isInteger(n) ? n.toFixed(1) : String(n));
const N = RING_STOPS.length;

// Opacity and tone across the ring system, by distance from the centre in
// planet radii. The same stops as the gradient in `saturn-scene.tsx`.
const RING_PROFILE = /* glsl */ `
  const float RING_R[${N}] = float[${N}](${RING_STOPS.map((s) => f(s[0])).join(", ")});
  const float RING_A[${N}] = float[${N}](${RING_STOPS.map((s) => f(s[1])).join(", ")});
  const float RING_T[${N}] = float[${N}](${RING_STOPS.map((s) => f(s[2])).join(", ")});
  vec2 ringProfile(float r) {
    vec2 p = vec2(0.0);
    for (int i = 0; i < ${N - 1}; i++) {
      if (r >= RING_R[i] && r < RING_R[i + 1]) {
        float k = (r - RING_R[i]) / (RING_R[i + 1] - RING_R[i]);
        p = vec2(mix(RING_A[i], RING_A[i + 1], k), mix(RING_T[i], RING_T[i + 1], k));
      }
    }
    return p;
  }
`;

const NOISE = /* glsl */ `
  float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float noise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x), mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
      mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x), mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y),
      f.z
    );
  }
  float fbm(vec3 p) {
    float a = 0.5;
    float s = 0.0;
    for (int i = 0; i < OCTAVES; i++) {
      s += a * noise(p);
      p = p * 2.03 + 7.1;
      a *= 0.5;
    }
    return s;
  }
`;

// How much of the planet's light survives at this pixel: 1 in open sky,
// `uPane` behind a pane, `uGlass` under anything read on a pane, `uBare`
// under anything read on the open field. `uView` maps a buffer pixel back to
// the viewport the mask was drawn in; the mask's channels are pane cover,
// cover of what is read on a pane, and cover of what is read off one.
// A change fades shade in, never out: cover never exceeds what the current
// layout asks for, so a page that has gone leaves no shadow of its cards
// behind (it was held through the next page's arrival, a dark patch across
// the rings where nothing stood).
const SHADE = /* glsl */ `
  uniform sampler2D uMask;
  uniform sampler2D uMaskFrom;
  uniform float uMaskMix;
  uniform float uPane;
  uniform float uGlass;
  uniform float uBare;
  uniform vec4 uView;
  uniform vec2 uViewport;
  uniform float uBufferHeight;
  uniform float uScroll;
  float glass() {
    vec2 p = uView.xy + vec2(gl_FragCoord.x, uBufferHeight - gl_FragCoord.y) * uView.zw;
    p.y += uScroll;
    vec2 uv = vec2(p.x / uViewport.x, 1.0 - p.y / uViewport.y);
    vec3 to = texture2D(uMask, uv).rgb;
    vec3 m = min(mix(texture2D(uMaskFrom, uv).rgb, to, uMaskMix), to);
    return min(mix(mix(1.0, uPane, m.r), uGlass, m.g), mix(1.0, uBare, m.b));
  }
`;

const VERTEX = /* glsl */ `
  varying vec3 vObj;
  varying vec3 vWorld;
  void main() {
    vObj = position;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const GLOBE_FRAGMENT = /* glsl */ `
  uniform vec3 uCream;
  uniform vec3 uGold;
  uniform vec3 uTan;
  uniform vec3 uGrey;
  uniform vec3 uGlow;
  uniform vec3 uRim;
  uniform vec3 uBackdrop;
  uniform vec3 uLight;
  uniform vec3 uRingNormal;
  uniform float uDim;
  varying vec3 vObj;
  varying vec3 vWorld;
  ${NOISE}
  ${RING_PROFILE}
  ${SHADE}

  // A pale oval storm, stretched along its latitude.
  float storm(float lon, float lat, vec2 at) {
    float dl = lon - at.x;
    vec2 d = vec2(atan(sin(dl), cos(dl)) * cos(at.y), lat - at.y) / vec2(0.2, 0.035);
    return exp(-dot(d, d));
  }

  void main() {
    vec3 n = normalize(vWorld);
    vec3 o = normalize(vObj);
    float lat = asin(clamp(o.y, -1.0, 1.0));
    float lon = atan(o.z, o.x);

    // Bands by latitude, their edges pushed around by noise sampled on the
    // sphere itself (so there is no seam) and stretched along the direction
    // of rotation. Everything with longitude in it — the wavy edges, the
    // streaks, the patches, the storms — is what the eye follows as the
    // globe turns.
    float warp = fbm(vec3(o.x * 2.6, lat * 7.0, o.z * 2.6)) - 0.5;
    float l = lat + warp * 0.07;
    float bands = sin(l * 9.0 + 0.4) * 0.5 + sin(l * 21.0 + 1.3) * 0.3 + sin(l * 47.0 + 2.1) * 0.2;
    float streak = fbm(vec3(o.x * 8.0, l * 55.0, o.z * 8.0)) - 0.5;
    float t = clamp(bands * 0.5 + 0.5 + streak * 0.7, 0.0, 1.0);

    vec3 alb = mix(uTan, uCream, smoothstep(0.2, 0.8, t));
    alb = mix(alb, uGold, exp(-l * l / 0.09) * 0.5);
    alb = mix(alb, uGrey, smoothstep(0.7, 1.25, abs(lat)) * 0.8);
    alb *= 1.0 - 0.14 * smoothstep(0.6, 1.0, sin(l * 33.0 + 0.7));
    alb *= 1.0 + (0.24 * noise(o * 1.7 + 3.0) - 0.12) * ${f(DETAIL)};
    float storms = storm(lon, l, vec2(0.6, 0.42)) + storm(lon, l, vec2(2.9, -0.33)) + storm(lon, l, vec2(-1.7, 0.12));
    alb = mix(alb, uCream, clamp(storms, 0.0, 1.0) * ${f(Math.min(0.55 * DETAIL, 0.9))});

    // A soft light: the terminator is wide and the night side keeps a little
    // of its colour, so the bands can still be read on the left limb.
    float day = smoothstep(${f(TERMINATOR[0])}, ${f(TERMINATOR[1])}, dot(n, uLight));

    // The rings' shadow: walk from this point toward the light and see how
    // much ring is in the way where the path crosses the ring plane.
    float toPlane = -dot(vWorld, uRingNormal) / dot(uLight, uRingNormal);
    float ringShade = toPlane > 0.0 ? ringProfile(length(vWorld + uLight * toPlane) / ${f(R)}).x * 0.8 : 0.0;

    float limb = mix(0.7, 1.0, sqrt(clamp(n.z, 0.0, 1.0)));
    vec3 col = alb * (${f(AMBIENT)} + ${f(1 - AMBIENT)} * day * (1.0 - ringShade)) * limb;

    // Hairlines only: a warm edge where the limb is lit and a very thin cool
    // one on the night side, which is the glass below reflecting back.
    float edge = pow(1.0 - clamp(n.z, 0.0, 1.0), 5.0);
    col += uGlow * edge * day * 0.12;
    col += uRim * edge * (1.0 - day) * 0.1;

    // A route dims the planet toward the black behind it, never toward
    // transparency: the body stays opaque, so no star shows through it.
    col = mix(uBackdrop, col * glass(), uDim);
    col += (hash(vec3(gl_FragCoord.xy, 1.0)) - 0.5) / 255.0;
    gl_FragColor = vec4(col, 1.0);
  }
`;

const RING_FRAGMENT = /* glsl */ `
  uniform vec3 uIvory;
  uniform vec3 uSilver;
  uniform vec3 uDust;
  uniform vec3 uLight;
  uniform vec3 uRingNormal;
  uniform float uDim;
  uniform float uTime;
  varying vec3 vObj;
  varying vec3 vWorld;
  ${NOISE}
  ${RING_PROFILE}
  ${SHADE}

  const float TAU = 6.2831853;

  // One lane of orbiting material. The plane is cut into lanes \`width\`
  // radii wide; each turns rigidly at the Kepler rate for its own centre and
  // carries \`cycles\` features around its orbit, sampled on a circle so there
  // is no seam. \`shift\` offsets the lane boundaries by a fraction of a lane.
  float lane(float r, float angle, float width, float shift, float cycles, float seed) {
    float id = floor(r / width + shift);
    float centre = (id + 0.5 - shift) * width;
    float rate = ${f((Math.PI * 2) / SPIN_S)} * pow(1.86 / centre, 1.5);
    float th = angle - rate * uTime + hash(vec3(id, seed, 3.0)) * TAU;
    float k = cycles / TAU;
    // The third axis drifts slowly, so a clump also gathers and thins as it
    // goes round instead of being a fixed stamp carried along.
    return noise(vec3(cos(th) * k, sin(th) * k, id * 1.7 + seed + uTime * 0.035));
  }

  // Two sets of lanes, half a lane apart, each faded to nothing at its own
  // boundaries where the other set is at full weight. Neighbouring lanes
  // slip past each other at their own rates — the inner material visibly
  // overtaking the outer — and there is no seam where one lane meets the next.
  float orbit(float r, float angle, float width, float cycles, float seed) {
    float w = sin(3.1415927 * fract(r / width));
    w *= w;
    return w * lane(r, angle, width, 0.0, cycles, seed) + (1.0 - w) * lane(r, angle, width, 0.5, cycles, seed);
  }

  void main() {
    float r = length(vObj.xy) / ${f(R)};
    float angle = atan(vObj.y, vObj.x);
    // How many planet radii one pixel covers here. Detail finer than that is
    // faded out rather than left to shimmer where the plane is seen edge-on,
    // and the profile is taken across the pixel, not at its centre, so the
    // gaps and edges do not break into steps along the near side.
    float px = fwidth(r);
    vec2 profile = (ringProfile(r - px * 0.33) + ringProfile(r) + ringProfile(r + px * 0.33)) / 3.0;
    float a = profile.x;
    float tone = profile.y;
    // Ivory where the ring is dense, silver where it thins, and the dusty C
    // ring a little warmer — it is made of darker, dirtier material.
    vec3 col = mix(uSilver, uIvory, tone);
    col = mix(col, uDust, 0.22 * (1.0 - smoothstep(1.5, 1.56, r)));

    float sharp = 1.0 - smoothstep(0.006, 0.016, px);
    float hair = 1.0 - smoothstep(0.002, 0.006, px);

    // Ringlets, fixed in radius: a broad set everywhere, and fine grooves in
    // some stretches only, so the plane is banded rather than evenly combed.
    float broad = noise(vec3(r * 24.0, 1.7, 0.0)) - 0.5;
    float grooved = smoothstep(0.42, 0.68, noise(vec3(r * 5.0, 3.3, 0.0)));
    float fine = noise(vec3(r * 85.0, 5.0, 0.0)) - 0.5;
    float hairline = noise(vec3(r * 240.0, 9.0, 0.0)) - 0.5;
    a *= 1.0 + broad * 0.6 * sharp + grooved * (fine * 0.7 * sharp + hairline * 0.5 * hair);

    // What orbits: clumps a few dozen to the circuit, long streaks of dust,
    // and wide patches where the ring is thinner. All three are carried at
    // their lanes' Kepler rates, so the near side runs one way across the
    // planet and the far side the other, and the inner ring outruns the outer.
    // A lane narrower than a pixel would alternate with its neighbours row by
    // row, so the clumps fade to their mean where the lanes get that thin.
    float clump = mix(smoothstep(0.28, 0.78, orbit(r, angle, 0.05, 26.0, 11.0)), 0.5, smoothstep(0.015, 0.04, px));
    float streak = orbit(r, angle, 0.016, 70.0, 29.0) - 0.5;
    float sparse = smoothstep(0.3, 0.75, orbit(r, angle, 0.14, 7.0, 7.0));
    float density = (0.7 + 0.5 * clump) * (0.8 + 0.28 * sparse) + streak * 0.42 * sharp;

    // Spokes: dark radial smears on the B ring that keep pace with the globe
    // rather than with the particles, and form and fade as they go.
    float spokeAngle = angle - ${f((Math.PI * 2) / SPIN_S)} * uTime;
    float spoke = noise(vec3(cos(spokeAngle) * 3.4, sin(spokeAngle) * 3.4, r * 1.2 + uTime * 0.05));
    density *= 1.0 - 0.38 * smoothstep(0.58, 0.82, spoke) * smoothstep(1.6, 1.7, r) * (1.0 - smoothstep(1.88, 1.94, r));

    a = clamp(a * mix(1.0, density, ${f(CLUMP)}), 0.0, 1.0);
    col *= 0.72 + 0.32 * density;

    // Which face is seen. With the light and the eye on the same side, the
    // lit face: dense ring bright, scaled by how high the light stands over
    // the plane. On opposite sides, light comes through: the thin C ring and
    // the Cassini division glow and the dense B ring goes dark.
    float sunUp = dot(uLight, uRingNormal);
    float lit = sunUp * uRingNormal.z > 0.0
      ? mix(0.72, 1.0, smoothstep(0.1, 0.5, abs(sunUp)))
      : 0.3 + 2.2 * a * (1.0 - a);
    col *= lit;

    // The body's shadow: is the planet between this point and the light?
    float along = dot(vWorld, uLight);
    float off = dot(vWorld, vWorld) - along * along;
    float shade = along < 0.0 ? 1.0 - smoothstep(${f(R * R * 0.9)}, ${f(R * R * 1.02)}, off) : 0.0;
    col *= (1.0 - 0.94 * shade) * glass();

    a *= uDim;
    gl_FragColor = vec4(col * a, a);
  }
`;

// Warm light around the planet: the sky near it is not the same black as the
// sky far from it. Round, a little longer along the ring plane, stronger on
// the lit side, and broken up by a slow-varying noise so it reads as light in
// dust rather than as a vignette. It is shaded like everything else here, so
// it never lifts the ground under a line of text, and it has fallen to under
// two units of brightness by the edge of the box, so the box never shows.
const HAZE_FRAGMENT = /* glsl */ `
  uniform vec3 uGlow;
  uniform vec3 uLight;
  uniform float uRoll;
  uniform float uDim;
  varying vec3 vObj;
  varying vec3 vWorld;
  ${NOISE}
  ${SHADE}

  void main() {
    vec2 p = vWorld.xy / ${f(R)};
    vec2 q = vec2(cos(uRoll) * p.x + sin(uRoll) * p.y, -sin(uRoll) * p.x + cos(uRoll) * p.y);
    vec2 e = q / vec2(1.45, 1.1);
    float g = exp(-dot(e, e));
    float side = 0.7 + 0.4 * dot(normalize(p + 1e-4), normalize(uLight.xy));
    float dust = 0.78 + 0.44 * noise(vec3(p * 1.6, 4.0));
    vec3 col = uGlow * (${f(HAZE)} * g * side * dust * uDim) * glass();
    gl_FragColor = vec4(col, max(col.r, max(col.g, col.b)));
  }
`;

// A `#rrggbb` token as the display value it names, with no linear conversion:
// the shaders above composite in the same space the SVG and the rest of the
// page do, and write the result as it is.
function token(style: CSSStyleDeclaration, name: string) {
  const hex = style.getPropertyValue(name).trim().replace("#", "");
  const v = Number.parseInt(hex, 16);
  return new Vector3(((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255);
}

// `arriving`: the entrances (below) of the box and what holds it, while any
// is still to finish.
type Bounds = { left: number; top: number; right: number; bottom: number; arriving?: Animation[] };
type Shade = { panes: Bounds[]; marks: Bounds[]; bare: Bounds[]; scrollY: number };

const SKIP = ".saturn-scene,.night-sky,.sky-interaction,.sr-only,script,style,noscript";

// The page's arrival (globals.css, "The page arriving" and "The page's
// line"): the animations that bring something onto the screen.
const ARRIVALS = new Set(["enter-rise", "enter-fade", "line-rise", "word-in", "plate-fade", "plate-figure-rise"]);

/**
 * How far a box has come onto the screen, 0 to 1: the least of its entrances,
 * eased out as they are. The shade under it is drawn at this much, so it
 * starts with the box and takes as long — a price that comes up through its
 * slot over 680ms is shaded over the same 680ms, not darkened in 350ms
 * ahead of it.
 */
function arrived(box: Bounds): number {
  let least = 1;
  for (const a of box.arriving ?? []) {
    if (a.playState === "finished" || a.playState === "idle") continue;
    const t = a.effect?.getComputedTiming().progress ?? 0;
    least = Math.min(least, 1 - (1 - t) ** 3);
  }
  return least;
}

/**
 * What the planet must be dim behind, in viewport px at the current scroll:
 * the top-level panes, and everything that is read — the line boxes of every
 * text node and the boxes of images, charts and controls — `marks` on a pane,
 * `bare` on the open field, which has no glass of its own to darken the
 * planet and so takes a deeper shade. Nothing on the page is fixed but the
 * sky, so these hold for any later scroll by offsetting by `scrollY`.
 */
function collectShade(): Shade {
  const panes: Bounds[] = [];
  const marks: Bounds[] = [];
  const bare: Bounds[] = [];

  // Everything is measured where it will rest: each entrance still to run is
  // moved to its end for the measure and straight back, in the same task, so
  // no frame is drawn in between. A figure 130% below its slot, or a card
  // still lowered, is shaded where it lands; how much is `arrived`.
  const entrances = new Map<Element, Animation[]>();
  const held: [Animation, CSSNumberish][] = [];
  for (const a of document.getAnimations()) {
    if (!(a instanceof CSSAnimation) || !ARRIVALS.has(a.animationName) || a.playState === "finished") continue;
    const effect = a.effect;
    if (!(effect instanceof KeyframeEffect) || effect.pseudoElement || !effect.target || a.currentTime === null) continue;
    entrances.set(effect.target, [...(entrances.get(effect.target) ?? []), a]);
    held.push([a, a.currentTime]);
    a.currentTime = Number(effect.getComputedTiming().endTime);
  }
  const arrivingFor = (el: Element | null) => {
    const list: Animation[] = [];
    for (let e = el; e && e !== document.body; e = e.parentElement) list.push(...(entrances.get(e) ?? []));
    return list.length ? list : undefined;
  };
  const add = (list: Bounds[], b: DOMRect, el: Element | null) => {
    if (b.width > 0 && b.height > 0) {
      list.push({ left: b.left, top: b.top, right: b.right, bottom: b.bottom, arriving: arrivingFor(el) });
    }
  };

  for (const el of document.querySelectorAll(PANES)) {
    if (!el.parentElement?.closest(PANES)) add(panes, el.getBoundingClientRect(), el);
  }

  const range = document.createRange();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        return node.textContent?.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
      }
      const el = node as Element;
      if (el.matches(SKIP)) return NodeFilter.FILTER_REJECT;
      return el.matches(OBJECTS) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
    },
  });
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const el = n.nodeType === Node.TEXT_NODE ? n.parentElement : (n as Element);
    const list = el?.closest(PANES) ? marks : bare;
    if (n.nodeType === Node.TEXT_NODE) {
      range.selectNodeContents(n);
      for (const r of range.getClientRects()) add(list, r, el);
    } else {
      add(list, (n as Element).getBoundingClientRect(), el);
    }
  }

  for (const [a, time] of held) a.currentTime = time;
  return { panes, marks, bare, scrollY: window.scrollY };
}

/**
 * Paints the shade into `ctx` (a canvas at MASK_SCALE of the viewport and
 * `margin` px above and below it, `height` px tall in all): pane cover into
 * red, what is read on a pane into green, and off one into blue.
 * Each rectangle is grown to the middle of its feather and blurred by a
 * quarter of it, so its cover is about 0.98 at `reach` and about 0.02 at the
 * feather's far edge, along a smooth curve with no edge anywhere in it.
 */
// Returns whether any of it is still arriving, and so must be painted again
// on the next frame.
function paintShade(
  ctx: CanvasRenderingContext2D,
  shade: Shade,
  width: number,
  height: number,
  margin: number,
): boolean {
  const dy = window.scrollY - shade.scrollY - margin;
  let arriving = false;
  ctx.globalCompositeOperation = "source-over";
  ctx.shadowColor = "transparent";
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.globalCompositeOperation = "lighter";
  ctx.fillStyle = "#000";
  ctx.shadowOffsetX = OFFSCREEN;
  ctx.shadowOffsetY = 0;
  const paint = (list: Bounds[], rgb: string, { reach, feather }: { reach: number; feather: number }) => {
    // shadowBlur is twice the Gaussian's deviation, in canvas pixels.
    ctx.shadowBlur = (feather / 2) * MASK_SCALE;
    const grow = reach + feather / 2;
    const pad = reach + feather;
    for (const b of list) {
      const top = b.top - dy;
      const bottom = b.bottom - dy;
      if (bottom + pad < 0 || top - pad > height || b.right + pad < 0 || b.left - pad > width) continue;
      const amount = arrived(b);
      if (amount < 1) arriving = true;
      if (amount <= 0) continue;
      ctx.shadowColor = `rgb(${rgb} / ${amount})`;
      ctx.fillRect(
        (b.left - grow) * MASK_SCALE - OFFSCREEN,
        (top - grow) * MASK_SCALE,
        (b.right - b.left + 2 * grow) * MASK_SCALE,
        (bottom - top + 2 * grow) * MASK_SCALE,
      );
    }
  };
  paint(shade.panes, "255 0 0", PANE_SHADE);
  paint(shade.marks, "0 255 0", TEXT_SHADE);
  paint(shade.bare, "0 0 255", BARE_SHADE);
  ctx.shadowColor = "transparent";
  return arriving;
}

export type SaturnRender = {
  dispose: () => void;
};

export type SaturnOptions = {
  tier: SaturnTier;
  /** Draw the planet without advancing time (reduced motion). */
  still: boolean;
  /** Called once if the device cannot hold the frame rate; the caller disposes. */
  onTooSlow: () => void;
};

/**
 * Starts the render inside `box` (the square the SVG fills) and marks `scene`
 * with `data-three="on"` once a frame is on screen. Returns null when the
 * browser gives no WebGL context, in which case the SVG simply stays.
 */
export function mountSaturn(scene: HTMLElement, box: HTMLElement, options: SaturnOptions): SaturnRender | null {
  const tier = TIERS[options.tier];
  const canvas = document.createElement("canvas");
  canvas.className = "saturn-canvas";

  // Asked first on a throwaway canvas, so a browser without WebGL 2 falls
  // back quietly instead of three.js logging two errors on its way to the
  // same answer.
  const probe = document.createElement("canvas").getContext("webgl2");
  if (!probe) return null;
  probe.getExtension("WEBGL_lose_context")?.loseContext();

  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "low-power" });
  } catch {
    return null;
  }
  renderer.setClearColor(0x000000, 0);

  const style = getComputedStyle(scene);
  const number = (name: string, fallback: number) => {
    const v = Number.parseFloat(getComputedStyle(scene).getPropertyValue(name));
    return Number.isFinite(v) ? v : fallback;
  };
  // Where the camera is for this route — the ring plane's tilt toward the
  // viewer and the planet's roll — is layout, so it lives with the rest of
  // each route's placement in globals.css ("Saturn").
  const tiltFor = () => number("--saturn-tilt", SATURN_TILT_DEG) * RAD;
  const rollFor = () => number("--saturn-roll", SATURN_ROLL_DEG) * RAD;
  const light = new Vector3(...SATURN_LIGHT).normalize();
  const ringNormal = new Vector3();
  const dim = { value: number("--saturn-opacity", 1) };
  let dimTarget = dim.value;
  let tiltTarget = tiltFor();
  let rollTarget = rollFor();

  // The shade mask, redrawn whenever content moves over the planet. A new
  // texture for a new size, rather than resizing one three.js has already
  // allocated storage for.
  const mask = document.createElement("canvas");
  const maskContext = mask.getContext("2d");
  // The shade being faded out of when content changes (`MASK_FADE_MS`).
  const maskFrom = document.createElement("canvas");
  const maskFromContext = maskFrom.getContext("2d");
  const maskTexture = (canvas: HTMLCanvasElement) => {
    const t = new CanvasTexture(canvas);
    t.minFilter = LinearFilter;
    t.magFilter = LinearFilter;
    t.generateMipmaps = false;
    return t;
  };

  // Shared by both materials, so one write reaches both.
  const time = { value: 0 };
  const glassLevel = number("--saturn-glass", 0.2);
  const shade = {
    uMask: { value: maskTexture(mask) },
    uMaskFrom: { value: maskTexture(maskFrom) },
    uMaskMix: { value: 1 },
    uPane: { value: number("--saturn-pane", glassLevel) },
    uGlass: { value: glassLevel },
    uBare: { value: number("--saturn-bare", glassLevel) },
    uView: { value: new Vector4() },
    uViewport: { value: new Vector2(1, 1) },
    uBufferHeight: { value: 1 },
    // Where the viewport's top is in the mask: its margin, plus how far the
    // page has scrolled since the mask was painted.
    uScroll: { value: 0 },
  };
  const defines = { OCTAVES: tier.octaves };

  const globe = new Mesh(
    new SphereGeometry(R, 96, 64),
    new ShaderMaterial({
      defines,
      vertexShader: VERTEX,
      fragmentShader: GLOBE_FRAGMENT,
      uniforms: {
        ...shade,
        uCream: { value: token(style, "--saturn-cream") },
        uGold: { value: token(style, "--saturn-gold") },
        uTan: { value: token(style, "--saturn-tan") },
        uGrey: { value: token(style, "--saturn-grey") },
        uGlow: { value: token(style, "--saturn-glow") },
        uRim: { value: token(style, "--color-primary") },
        uBackdrop: { value: token(style, "--color-backdrop") },
        uLight: { value: light },
        uRingNormal: { value: ringNormal },
        uDim: dim,
      },
    }),
  );

  const rings = new Mesh(
    // A little wider than the profile, so the polygon's own edge is never
    // the ring's edge.
    new RingGeometry(R * 1.2, R * (RING_OUTER + 0.03), 192, 1),
    new ShaderMaterial({
      defines,
      vertexShader: VERTEX,
      fragmentShader: RING_FRAGMENT,
      uniforms: {
        ...shade,
        uIvory: { value: token(style, "--saturn-ring") },
        uSilver: { value: token(style, "--saturn-ring-cool") },
        uDust: { value: token(style, "--saturn-tan") },
        uLight: { value: light },
        uRingNormal: { value: ringNormal },
        uDim: dim,
        uTime: time,
      },
      transparent: true,
      premultipliedAlpha: true,
      depthWrite: false,
      side: DoubleSide,
    }),
  );
  // The ring is built in the XY plane; lay it into the equator. It is never
  // turned in that plane — the shader moves what is in it.
  rings.rotation.x = -Math.PI / 2;

  // Spin first, then open the plane toward the viewer, then roll.
  const planet = new Group();
  planet.rotation.order = "ZXY";
  planet.rotation.set(tiltTarget, 0, rollTarget);
  planet.add(globe, rings);

  // Behind everything, and not in `planet`: light in the sky does not tilt
  // with the ring plane, it only lies along it (`uRoll`). Drawn before the
  // rings and hidden by the opaque globe through the depth test.
  const roll = { value: rollTarget };
  const haze = new Mesh(
    new PlaneGeometry(1000, 1000),
    new ShaderMaterial({
      defines,
      vertexShader: VERTEX,
      fragmentShader: HAZE_FRAGMENT,
      uniforms: {
        ...shade,
        uGlow: { value: token(style, "--saturn-glow") },
        uLight: { value: light },
        uRoll: roll,
        uDim: dim,
      },
      transparent: true,
      premultipliedAlpha: true,
      depthWrite: false,
    }),
  );
  haze.position.z = -400;
  haze.renderOrder = -1;

  const world = new Scene();
  world.add(haze, planet);
  const camera = new OrthographicCamera(-500, 500, 500, -500, 1, 2000);
  camera.position.z = 1000;

  let ratioScale = 1;
  let dirty = true;
  // The buffer follows the box's layout width, not its size on screen. A
  // route pulls the camera back by scaling the box (0.75 to 1), and sizing
  // the buffer to the scaled box reallocated it at the end of every route
  // change, a dropped frame just as the camera landed. Drawn for the full box
  // instead, it is the same on every route; on a 2x screen the tier's buffer
  // cap was already the size on all of them.
  const resize = () => {
    const size = box.clientWidth;
    if (!size) return;
    const ratio = Math.min(window.devicePixelRatio || 1, tier.ratio, tier.buffer / size) * ratioScale;
    if (Math.round(size * ratio) === canvas.width) return;
    renderer.setPixelRatio(ratio);
    renderer.setSize(size, size, false);
    shade.uBufferHeight.value = canvas.height;
    dirty = true;
  };
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(box);
  // While the camera travels between views the canvas moves under the mask,
  // so every frame is drawn, not every other.
  let traveling = false;
  const view = scene.firstElementChild;
  const onTransitionRun = (e: TransitionEvent) => {
    if (e.target === view && e.propertyName === "transform") traveling = true;
  };
  const onTransitionEnd = (e: TransitionEvent) => {
    if (e.target === view && e.propertyName === "transform") traveling = false;
  };
  scene.addEventListener("transitionrun", onTransitionRun);
  scene.addEventListener("transitionend", onTransitionEnd);
  scene.addEventListener("transitioncancel", onTransitionEnd);
  resize();

  // What the mask is drawn from. Measured on the first frame after content
  // changes and again once it has come to rest (`page-rest.ts`), never on
  // the frames in between: an entrance moves its boxes by a few pixels,
  // which the mask's feather absorbs, and measuring every pane and line of
  // text on each frame of it is what made a route change stutter.
  // A change fades from the shade last fully shown; a second change during
  // the fade keeps fading from it, with at most half the fade to go.
  let shadeBoxes: Shade | null = null;
  let fromBoxes: Shade | null = null;
  let fadeFrom = 0;
  let maskDirty = true;
  // Shade under content still arriving (`arrived`) is painted again on every
  // frame of its entrance.
  let shadeArriving = false;
  const remeasure = () => {
    const next = collectShade();
    if (shadeBoxes) {
      const now = performance.now();
      if (!fromBoxes) {
        fromBoxes = shadeBoxes;
        fadeFrom = now;
      } else {
        fadeFrom = Math.max(fadeFrom, now - MASK_FADE_MS / 2);
      }
    }
    shadeBoxes = next;
    maskDirty = true;
    dirty = true;
  };

  // The route's brightness and tilt, from the attribute the SVG's views hang on.
  const viewObserver = new MutationObserver(() => {
    dimTarget = number("--saturn-opacity", 1);
    tiltTarget = tiltFor();
    rollTarget = rollFor();
    shade.uPane.value = number("--saturn-pane", glassLevel);
  });
  viewObserver.observe(scene, { attributes: true, attributeFilter: ["data-view"] });

  // A scroll only moves the boxes already measured; the window or the
  // content changing re-measures. And it only moves the mask already painted,
  // which reaches `maskMargin` past the viewport's edges: it is painted again
  // once the page has scrolled that far. Painting it on every frame of a
  // scroll, blur and upload, is what dropped frames from a scroll on an M4
  // MacBook Air (6 in 1000 against none, measured 2026-10-05); drawing the
  // planet itself on every frame dropped none.
  let paintedScrollY = 0;
  let maskMargin = 0;
  const onScroll = () => {
    if (Math.abs(window.scrollY - paintedScrollY) > maskMargin) maskDirty = true;
    dirty = true;
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  const stopWatching = watchPageRest({ scene, onChange: remeasure, onRest: remeasure });
  // A page swapped into <main> is measured and drawn before that frame is
  // painted. Left to the next frame, the planet was drawn once or twice more
  // with the shade of the page that had just gone — a dark flash across it
  // on every route change, the whole planet leaving News.
  const swapObserver = new MutationObserver((records) => {
    const swapped = records.some((r) =>
      [...r.addedNodes].some((n) => n instanceof Element && (n.matches(".page-enter") || n.querySelector(".page-enter"))),
    );
    if (!swapped || document.hidden) return;
    remeasure();
    cancelAnimationFrame(frame);
    tick(performance.now());
  });
  const main = document.querySelector("main");
  if (main) swapObserver.observe(main, { childList: true, subtree: true });

  const frameMs = 1000 / tier.fps;
  let frame = 0;
  let last = 0;
  let previous = 0;
  let clock = 0;
  let shown = false;
  let lost = false;
  // The frame-rate watch: the mean gap between animation frames over a
  // window. A slow first window halves the buffer; a slow second one gives up.
  let samples = 0;
  let sampleSum = 0;
  let strikes = 0;

  const tick = (now: number) => {
    frame = requestAnimationFrame(tick);
    const gap = now - previous;
    previous = now;
    if (lost || document.querySelector(".panel-overlay")) return;

    if (shown && !options.still && gap > 0 && gap < 250) {
      sampleSum += gap;
      if (++samples === 90) {
        if (sampleSum / samples > 40 && ++strikes === 2) return options.onTooSlow();
        if (sampleSum / samples > 40) {
          ratioScale = 0.6;
          resize();
        }
        samples = 0;
        sampleSum = 0;
      }
    }

    // Content moving over the planet, and the planet travelling under it, are
    // followed on the frame they happen; the planet's own motion is throttled.
    const fading = fromBoxes !== null || shadeArriving;
    if (shadeArriving) maskDirty = true;
    const moving =
      traveling || fading || Math.abs(dimTarget - dim.value) > 0.004 || Math.abs(tiltTarget - planet.rotation.x) > 0.0005;
    if (options.still ? !dirty && !moving : !dirty && !traveling && !fading && now - last < frameMs) return;
    dirty = false;
    if (!options.still && now - last >= frameMs) {
      clock += Math.min(now - last, 100) / 1000;
      last = now;
    }

    const bounds = canvas.getBoundingClientRect();
    if (maskDirty && maskContext) {
      maskDirty = false;
      if (!shadeBoxes) shadeBoxes = collectShade();
      const width = document.documentElement.clientWidth;
      maskMargin = Math.ceil(window.innerHeight / 2);
      paintedScrollY = window.scrollY;
      const height = window.innerHeight + 2 * maskMargin;
      const w = Math.ceil(width * MASK_SCALE);
      const h = Math.ceil(height * MASK_SCALE);
      if (mask.width !== w || mask.height !== h) {
        mask.width = maskFrom.width = w;
        mask.height = maskFrom.height = h;
        shade.uMask.value.dispose();
        shade.uMask.value = maskTexture(mask);
        shade.uMaskFrom.value.dispose();
        shade.uMaskFrom.value = maskTexture(maskFrom);
      }
      shadeArriving = paintShade(maskContext, shadeBoxes, width, height, maskMargin);
      shade.uMask.value.needsUpdate = true;
      if (fromBoxes && maskFromContext) {
        paintShade(maskFromContext, fromBoxes, width, height, maskMargin);
        shade.uMaskFrom.value.needsUpdate = true;
      }
      shade.uViewport.value.set(width, height);
    }
    if (fromBoxes) {
      const t = Math.min(1, (now - fadeFrom) / MASK_FADE_MS);
      shade.uMaskMix.value = t * t * (3 - 2 * t);
      if (t === 1) fromBoxes = null;
    } else {
      shade.uMaskMix.value = 1;
    }
    shade.uView.value.set(bounds.left, bounds.top, bounds.width / canvas.width, bounds.height / canvas.height);
    shade.uScroll.value = maskMargin + window.scrollY - paintedScrollY;

    time.value = clock;
    globe.rotation.y = (clock / SPIN_S) * Math.PI * 2;
    // The planet does not turn with the pointer: it eases only toward the
    // route's own tilt and roll.
    planet.rotation.x += (tiltTarget - planet.rotation.x) * 0.06;
    planet.rotation.z += (rollTarget - planet.rotation.z) * 0.06;
    planet.updateMatrixWorld();
    roll.value = planet.rotation.z;
    ringNormal.set(0, 1, 0).applyQuaternion(planet.quaternion);
    dim.value += (dimTarget - dim.value) * 0.14;

    renderer.render(world, camera);
    if (!shown) {
      shown = true;
      scene.dataset.three = "on";
      scene.dataset.tier = options.tier;
    }
  };

  const onVisibility = () => {
    cancelAnimationFrame(frame);
    if (!document.hidden) {
      dirty = true;
      frame = requestAnimationFrame(tick);
    }
  };
  // A lost context puts the SVG back; a restored one takes over again.
  const onLost = (e: Event) => {
    e.preventDefault();
    lost = true;
    shown = false;
    scene.dataset.three = "off";
  };
  const onRestored = () => {
    lost = false;
    maskDirty = true;
    dirty = true;
  };
  document.addEventListener("visibilitychange", onVisibility);
  canvas.addEventListener("webglcontextlost", onLost);
  canvas.addEventListener("webglcontextrestored", onRestored);

  box.append(canvas);
  if (!document.hidden) frame = requestAnimationFrame(tick);

  return {
    dispose: () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      scene.removeEventListener("transitionrun", onTransitionRun);
      scene.removeEventListener("transitionend", onTransitionEnd);
      scene.removeEventListener("transitioncancel", onTransitionEnd);
      viewObserver.disconnect();
      stopWatching();
      window.removeEventListener("scroll", onScroll);
      swapObserver.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
      delete scene.dataset.three;
      delete scene.dataset.tier;
      canvas.remove();
      globe.geometry.dispose();
      globe.material.dispose();
      rings.geometry.dispose();
      rings.material.dispose();
      haze.geometry.dispose();
      haze.material.dispose();
      shade.uMask.value.dispose();
      shade.uMaskFrom.value.dispose();
      renderer.dispose();
    },
  };
}
