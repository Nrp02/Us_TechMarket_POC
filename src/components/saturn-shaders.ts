// The planet's shader source and the look it is tuned to. Text only: nothing
// here touches the DOM or WebGL, so the render (`saturn-webgl.ts`) reads it
// and the tuning lives in one place.

import { RING_STOPS, SATURN_R } from "@/components/saturn-profile";

export const R = SATURN_R;
export const SPIN_S = 75;
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

export const VERTEX = /* glsl */ `
  varying vec3 vObj;
  varying vec3 vWorld;
  void main() {
    vObj = position;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

export const GLOBE_FRAGMENT = /* glsl */ `
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

export const RING_FRAGMENT = /* glsl */ `
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
export const HAZE_FRAGMENT = /* glsl */ `
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
