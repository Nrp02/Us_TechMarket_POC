"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

import { DATA_ARRIVED } from "@/components/meteors";
import { BRIGHT, DIM, isAnchor } from "@/components/sky-field";
import { PANES, forEachReadBox } from "@/components/page-measure";

// Two small responses from the sky, both decoration and both behind the glass.
//
//   1. GLOW — on a fine pointer, the stars within a small radius of the cursor
//      brighten a little and then settle back. Never a touch screen: there is
//      no hovering finger, and a glow that follows a scroll gesture would be
//      motion nobody asked for.
//   2. CONSTELLATION — a fine pointer passing over one of a handful of bright
//      stars, or a tap on it on a touch screen, traces a figure through the
//      stars around it: two arms leave the star in opposite directions, each
//      a chain of thin lines that bends gently from star to star, drawn at
//      one steady speed, held a moment, and faded. Nothing opens, nothing is
//      counted, and the cursor never changes over a star, so it cannot read
//      as a control.
//
// Neither effect ever lands under content. Every panel, the nav card, and all
// text or controls sitting on the bare field are collected as rectangles; a
// star inside one (with margin) does not glow, is not an anchor, and no line
// may cross one. A lit point behind 34% glass under a glyph is exactly the hot
// spot `night-sky.tsx` already keeps bright stars away from.
//
// Independent of the sky's own ambient motion, in both directions. Nothing
// here starts, speeds, slows or pauses the depth sway or the twinkle — they
// are CSS and never hear about the pointer. And the sway never throws these
// off their stars: each star belongs to a depth layer (mid for the dim tier,
// near for the bright), and every hit test and every drawn frame reads that
// layer's live offset first, so a glow or a line stays centred on a star that
// is slowly moving. A constellation still suppresses the glow until it has
// faded, and the page-change meteors hold both back while they cross.
//
// Cost: this draws into its own canvas layer, never into the sky's SVG, so the
// sky's cached texture (two fractal filters) is never re-rasterised. The canvas
// runs a frame loop only while something is fading, then clears once and
// stops. Under reduced motion none of it is started.

const GLOW_RADIUS = 110; // CSS px around the pointer
const GLOW_RISE_MS = 90;
const GLOW_FALL_MS = 650;

const LINK_MIN = 36;
const LINK_MAX = 220;
// The figure's two arms, in lines: the first leaves in whichever direction
// has the nearest star, the second roughly opposite it.
const ARMS = [4, 2];
// The sharpest bend an arm may take from one line to the next. Wider and a
// chain doubles back on itself into a zigzag; narrower and it is a ruler.
const MAX_TURN = 1.5; // radians
// Lines are traced at one speed, so a long line takes longer than a short one.
const TRACE_PX_PER_MS = 0.42;
// The ring that marks the anchor comes up over this long.
const RING_MS = 450;
const HOLD_MS = 1400;
const FADE_MS = 1000;

// Meteors run 1150ms plus a 160ms trail offset.
const METEOR_QUIET_MS = 1400;

// Keep-out margin around content, in CSS px.
const MARGIN = 14;

// Everything a star must not glow or draw under. Panels by material. On the
// bare field, by what is actually drawn there: the line boxes of each text
// node and the boxes of images and controls — NOT the element boxes of
// headings and paragraphs, which are blocks as wide as the page. Measured on
// the 404 route: the <h1>'s box ran the full 1422px width, so a click on empty
// sky 450px right of the last glyph landed "on the heading" and the whole
// band beside it counted as text. Section-heading rows are the one exception,
// taken whole from their <h2>, so the hairline running to the meta is kept
// clear as well.
// A click whose target is any of these is an interaction with content, not
// with the sky. Text is not listed: a block's target area is wider than its
// text, so text is judged by the line-box rectangles instead.
const NOT_SKY = `${PANES},a,button,input,select,textarea,summary,label,[role]`;

// `bx`/`by` are the star's resting position; `x`/`y` add its depth layer's
// current sway offset and are what every test and draw uses.
type Star = { bx: number; by: number; x: number; y: number; r: number; depth: 0 | 1; anchor: boolean; hidden: boolean };
type Rect = { l: number; t: number; r: number; b: number };
// A line from star `a` to star `b`, traced from `begin` for `span` ms after
// the figure starts.
type Line = { a: number; b: number; begin: number; span: number };
type Constellation = { from: number; lines: Line[]; start: number; fadeFrom: number };

export function SkyInteraction() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pathname = usePathname();
  // Set by the effect below; lets the route-change effect reach the loop.
  const quietRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const reducedMq = matchMedia("(prefers-reduced-motion: reduce)");
    const fineMq = matchMedia("(hover: hover) and (pointer: fine)");
    const coarseMq = matchMedia("(pointer: coarse)");

    const source = [
      ...DIM.map(([x, y, r]) => ({ x, y, r, depth: 0 as const, anchor: false })),
      ...BRIGHT.map(([x, y, r]) => ({ x, y, r, depth: 1 as const, anchor: isAnchor(x, y) })),
    ];
    let stars: Star[] = [];
    const peak = new Float32Array(source.length);
    const level = new Float32Array(source.length);

    let rects: Rect[] = [];
    let rectsDirty = true;
    let width = 0;
    let height = 0;
    let dpr = 1;

    let constellation: Constellation | null = null;
    // The anchor whose figure the pointer has drawn, which it must leave
    // before that star can draw again.
    let spent = -1;
    let quietUntil = 0;
    let frame = 0;
    let last = 0;

    // The two star depths this reads, in `depth` order. Looked up once: the
    // sky is rendered by the root layout and never remounts.
    const layers = [
      document.querySelector<HTMLElement>(".night-sky .depth-mid"),
      document.querySelector<HTMLElement>(".night-sky .depth-near"),
    ];
    // Moves every star onto its layer's current sway offset. A computed
    // transform during a running animation is the animated value, so this is
    // where the star actually is on screen right now. Two style reads, and
    // only ever called while an effect is live or being hit-tested.
    const follow = () => {
      const off = layers.map((el) => {
        if (!el) return { x: 0, y: 0 };
        const t = getComputedStyle(el).transform;
        if (!t || t === "none") return { x: 0, y: 0 };
        const m = new DOMMatrixReadOnly(t);
        return { x: m.m41, y: m.m42 };
      });
      for (const st of stars) {
        st.x = st.bx + off[st.depth].x;
        st.y = st.by + off[st.depth].y;
      }
    };

    // `xMidYMid slice` over a 1600x1000 viewBox, the same mapping the sky's
    // SVG uses, taken from the canvas box, which is sized like the sky.
    const layout = () => {
      const box = canvas.getBoundingClientRect();
      width = box.width;
      height = box.height;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      const s = Math.max(width / 1600, height / 1000);
      const ox = (width - 1600 * s) / 2;
      const oy = (height - 1000 * s) / 2;
      stars = source.map((p) => ({
        bx: ox + p.x * s,
        by: oy + p.y * s,
        x: ox + p.x * s,
        y: oy + p.y * s,
        r: Math.max(p.r * s, 0.8),
        depth: p.depth,
        anchor: p.anchor,
        hidden: true,
      }));
      rectsDirty = true;
    };

    const inRect = (x: number, y: number) =>
      rects.some((q) => x >= q.l && x <= q.r && y >= q.t && y <= q.b);

    const collectRects = () => {
      if (!rectsDirty) return;
      rectsDirty = false;
      rects = [];
      const add = (b: DOMRect | DOMRectReadOnly) => {
        if (b.width === 0 || b.height === 0) return;
        if (b.bottom < -MARGIN || b.top > height + MARGIN) return;
        rects.push({ l: b.left - MARGIN, t: b.top - MARGIN, r: b.right + MARGIN, b: b.bottom + MARGIN });
      };

      for (const el of document.querySelectorAll(PANES)) add(el.getBoundingClientRect());
      // The planet's body (`saturn-scene.tsx`) is opaque and painted over this
      // canvas, so a star behind it is covered like one behind a panel.
      for (const el of document.querySelectorAll("[data-sky-occluder]")) add(el.getBoundingClientRect());
      for (const h of document.querySelectorAll("main h2")) {
        if (!h.closest(PANES) && h.parentElement) add(h.parentElement.getBoundingClientRect());
      }

      // Everything on the bare field, skipping each panel's subtree whole —
      // the panel's own box already covers it.
      const main = document.querySelector("main");
      if (main) forEachReadBox(main, PANES, (box) => add(box));

      follow();
      for (const st of stars) {
        st.hidden = st.x < 0 || st.y < 0 || st.x > width || st.y > height || inRect(st.x, st.y);
      }
    };

    // Sampled every 6px — a line is at most 220px, and a rect is never
    // thinner than the 28px of margin wrapped around it.
    const crosses = (a: Star, b: Star) => {
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      const steps = Math.ceil(len / 6);
      for (let k = 1; k < steps; k++) {
        const t = k / steps;
        if (inRect(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t)) return true;
      }
      return false;
    };

    // Whether two lines cross away from the star they share.
    const cut = (p: Star, q: Star, r: Star, s: Star) => {
      if (p === r || p === s || q === r || q === s) return false;
      const side = (a: Star, b: Star, c: Star) => Math.sign((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));
      return side(p, q, r) !== side(p, q, s) && side(r, s, p) !== side(r, s, q);
    };

    // The figure from an anchor: each arm walks to the nearest star it may
    // reach, never back to one it has used, never through content or across
    // a line already drawn, and never turning sharper than MAX_TURN. The
    // second arm starts heading away from the first.
    const figure = (from: number): Line[] => {
      const lines: Line[] = [];
      const used = new Set([from]);
      let away: number | null = null;
      for (const length of ARMS) {
        let at = from;
        let heading = away;
        let begin = 0;
        for (let k = 0; k < length; k++) {
          const a = stars[at];
          let best = -1;
          let bestD = Infinity;
          let bestAng = 0;
          stars.forEach((st, i) => {
            if (used.has(i) || st.hidden) return;
            const d = Math.hypot(st.x - a.x, st.y - a.y);
            if (d < LINK_MIN || d > LINK_MAX || d >= bestD) return;
            const ang = Math.atan2(st.y - a.y, st.x - a.x);
            if (heading !== null) {
              const turn = Math.abs(ang - heading) % (Math.PI * 2);
              if (Math.min(turn, Math.PI * 2 - turn) > MAX_TURN) return;
            }
            if (crosses(a, st) || lines.some((l) => cut(a, st, stars[l.a], stars[l.b]))) return;
            best = i;
            bestD = d;
            bestAng = ang;
          });
          if (best < 0) break;
          const span = bestD / TRACE_PX_PER_MS;
          lines.push({ a: at, b: best, begin, span });
          if (k === 0 && away === null) away = bestAng + Math.PI;
          used.add(best);
          begin += span;
          heading = bestAng;
          at = best;
        }
      }
      return lines;
    };

    const draw = (now: number) => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      ctx.globalCompositeOperation = "lighter";

      // Glow: a small brighter core and a faint halo. Additive over the star
      // the sky already drew, so it only ever brightens, and only a little.
      for (let i = 0; i < stars.length; i++) {
        const l = level[i];
        if (l < 0.004) continue;
        const st = stars[i];
        const halo = Math.max(st.r * 5, 7);
        const g = ctx.createRadialGradient(st.x, st.y, 0, st.x, st.y, halo);
        g.addColorStop(0, `rgba(231, 235, 242, ${0.2 * l})`);
        g.addColorStop(1, "rgba(231, 235, 242, 0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(st.x, st.y, halo, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = `rgba(244, 246, 250, ${0.38 * l})`;
        ctx.beginPath();
        ctx.arc(st.x, st.y, st.r * 1.2, 0, Math.PI * 2);
        ctx.fill();
      }

      if (constellation) {
        const c = constellation;
        const t = now - c.start;
        const fade = now < c.fadeFrom ? 1 : Math.max(0, 1 - (now - c.fadeFrom) / FADE_MS);
        const a = stars[c.from];
        ctx.lineCap = "round";
        ctx.lineWidth = 1;
        // Traced at a constant speed, so where one line ends the next goes
        // on without a pause or a lurch.
        for (const line of c.lines) {
          const p = Math.min(1, Math.max(0, (t - line.begin) / line.span));
          if (p <= 0) continue;
          const s = stars[line.a];
          const b = stars[line.b];
          ctx.strokeStyle = `rgba(214, 224, 240, ${0.38 * fade})`;
          ctx.beginPath();
          ctx.moveTo(s.x, s.y);
          ctx.lineTo(s.x + (b.x - s.x) * p, s.y + (b.y - s.y) * p);
          ctx.stroke();
          if (p === 1) {
            ctx.fillStyle = `rgba(244, 246, 250, ${0.4 * fade})`;
            ctx.beginPath();
            ctx.arc(b.x, b.y, b.r * 1.3, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        ctx.strokeStyle = `rgba(214, 224, 240, ${0.3 * fade * Math.min(1, t / RING_MS)})`;
        ctx.beginPath();
        ctx.arc(a.x, a.y, a.r * 3.2, 0, Math.PI * 2);
        ctx.stroke();
      }
    };

    const tick = (now: number) => {
      const dt = last ? Math.min(now - last, 64) : 16;
      last = now;

      const fall = Math.exp(-dt / GLOW_FALL_MS);
      const rise = 1 - Math.exp(-dt / GLOW_RISE_MS);
      let glowing = false;
      for (let i = 0; i < level.length; i++) {
        peak[i] *= fall;
        level[i] += (peak[i] - level[i]) * rise;
        if (level[i] > 0.004 || peak[i] > 0.004) glowing = true;
      }

      if (constellation && now > constellation.fadeFrom + FADE_MS) constellation = null;

      follow();
      draw(now);

      if (glowing || constellation) {
        frame = requestAnimationFrame(tick);
      } else {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        frame = 0;
        last = 0;
      }
    };

    const run = () => {
      if (!frame) frame = requestAnimationFrame(tick);
    };

    // The visible anchor within `hit` px of a point on bare sky, or -1.
    const anchorAt = (x: number, y: number, hit: number) => {
      if (inRect(x, y)) return -1;
      let from = -1;
      let best = hit;
      stars.forEach((st, i) => {
        if (!st.anchor || st.hidden) return;
        const d = Math.hypot(st.x - x, st.y - y);
        if (d < best) {
          best = d;
          from = i;
        }
      });
      return from;
    };

    // Draws the figure from an anchor, if it has one of at least two lines.
    const begin = (from: number) => {
      const lines = figure(from);
      if (lines.length < 2) return;
      const now = performance.now();
      const traced = Math.max(...lines.map((l) => l.begin + l.span));
      constellation = { from, lines, start: now, fadeFrom: now + traced + HOLD_MS };
      peak.fill(0);
      run();
    };

    const onMove = (e: PointerEvent) => {
      if (reducedMq.matches || !fineMq.matches || e.pointerType === "touch") return;
      if (constellation || performance.now() < quietUntil) return;
      collectRects();
      follow();
      const on = e.target instanceof Element && e.target.closest(NOT_SKY) ? -1 : anchorAt(e.clientX, e.clientY, 28);
      if (on !== spent) spent = -1;
      if (on >= 0 && on !== spent) {
        spent = on;
        begin(on);
        return;
      }
      let any = false;
      for (let i = 0; i < stars.length; i++) {
        const st = stars[i];
        if (st.hidden) continue;
        const d = Math.hypot(st.x - e.clientX, st.y - e.clientY);
        if (d >= GLOW_RADIUS) continue;
        const target = (1 - d / GLOW_RADIUS) ** 2;
        if (target > peak[i]) peak[i] = target;
        any = true;
      }
      if (any) run();
    };

    // A tap. A fine pointer draws by resting (onMove), so its click on the
    // sky does nothing; a touch screen on a laptop with one still taps.
    const onClick = (e: MouseEvent) => {
      if (reducedMq.matches || e.button !== 0) return;
      if (fineMq.matches && (e as PointerEvent).pointerType !== "touch") return;
      if (performance.now() < quietUntil) return;
      const target = e.target as Element | null;
      if (target?.closest(NOT_SKY)) return;
      if (!window.getSelection()?.isCollapsed) return;
      rectsDirty = true;
      collectRects();
      follow();
      const from = anchorAt(e.clientX, e.clientY, coarseMq.matches ? 40 : 28);
      if (from >= 0) begin(from);
    };

    // Content moves over a fixed sky on scroll, so a line that was clear can
    // end up behind a card. Fade it now rather than let it sit under text.
    const onScroll = () => {
      rectsDirty = true;
      if (constellation) {
        const now = performance.now();
        if (now < constellation.fadeFrom) constellation.fadeFrom = now;
      }
    };

    const onResize = () => {
      layout();
      constellation = null;
      peak.fill(0);
    };

    const quiet = () => {
      quietUntil = performance.now() + METEOR_QUIET_MS;
      rectsDirty = true;
      constellation = null;
      peak.fill(0);
      if (!frame) frame = requestAnimationFrame(tick);
    };

    // A hidden tab runs no frames. Drop anything in flight so the sky comes
    // back as its static self rather than resuming a half-faded figure.
    const onVisibility = () => {
      if (document.visibilityState !== "hidden") return;
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      last = 0;
      constellation = null;
      peak.fill(0);
      level.fill(0);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    };
    quietRef.current = quiet;

    const onReducedChange = () => {
      if (!reducedMq.matches) return;
      constellation = null;
      peak.fill(0);
      level.fill(0);
    };

    layout();
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("click", onClick);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    window.addEventListener(DATA_ARRIVED, quiet);
    document.addEventListener("visibilitychange", onVisibility);
    reducedMq.addEventListener("change", onReducedChange);

    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("click", onClick);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      window.removeEventListener(DATA_ARRIVED, quiet);
      document.removeEventListener("visibilitychange", onVisibility);
      reducedMq.removeEventListener("change", onReducedChange);
      if (frame) cancelAnimationFrame(frame);
      quietRef.current = null;
    };
  }, []);

  // The meteors fly on every arrival — first load and each route change (their
  // key includes the pathname) — so hold the sky's other effects back until
  // they have crossed. Runs after the effect above has set quietRef.
  useEffect(() => {
    quietRef.current?.();
  }, [pathname]);

  return <canvas ref={canvasRef} className="sky-interaction" aria-hidden />;
}
