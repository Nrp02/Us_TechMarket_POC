"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";

import { watchPageRest } from "@/components/page-rest";
import type { SaturnRender, SaturnTier } from "@/components/saturn-webgl";

// The part of the planet that cannot be known on the server: which route is
// showing and which tier of the 3D render this device gets. It does not
// follow the pointer: the planet turning with the mouse was cut, and a lean
// of the near stars and the planet's light over open sky was tried in its
// place and cut as well (2026-10-04) — open sky clear of panes and text is
// 6-19% of a first screen, and in it the lean moved the stars a few pixels
// and the light by nothing anyone could see. Everything drawn is passed in as `children` from
// `saturn-scene.tsx`, a server component, so the artwork never ships as
// client code — the same split the layout already uses to hand
// `SessionMarker` to `TopBar`.
//
// It holds no state. The route becomes one attribute, `data-view`, and CSS
// does the rest (see "Saturn" in globals.css): each view is a position, a
// scale, a tilt and a roll, composed per route and per device class, and the
// move between them is the camera travelling as the meteors cross. That
// transition is the whole of the route response — there is no second arrival
// system here, only a second thing that answers the pathname the meteors are
// already keyed on.

export type SaturnView = "market" | "stocks" | "news";

// Anything that is not Market or a stock page (the 404 included) takes
// News's view.
export function saturnViewFor(pathname: string): SaturnView {
  if (pathname === "/") return "market";
  if (pathname.startsWith("/todays-activity")) return "stocks";
  return "news";
}

// The camera between views. While the planet travels from one route's view
// to the next, the sky's star depths swing with it, each by a share of the
// planet's move — far 3%, mid 6%, near 12% at the most — and the nearer ones
// dolly a little with its change of scale. They go from rest, peak a third of
// the way through, and settle back where they started as the planet lands:
// the stars must end on their own positions, which is what keeps the bright
// ones out from behind the panes (`night-sky.tsx`), and starting from rest
// means nothing jumps on the first frame. Shares rather than a fixed amount,
// so a short move is a small parallax and a long one a larger one. The
// duration and the curve are the planet's own (`--camera-*` in globals.css).
const SWING_PEAK = 0.35;
const DEPTHS = [
  { selector: ".depth-far", share: 0.03, dolly: 0.015 },
  { selector: ".depth-mid", share: 0.06, dolly: 0.04 },
  { selector: ".depth-near", share: 0.12, dolly: 0.08 },
] as const;

// One depth's added offset during a camera move.
type Pose = { x: number; y: number; scale: number };
const REST: Pose = { x: 0, y: 0, scale: 1 };
const transformOf = (p: Pose) =>
  `translate3d(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px, 0) scale(${p.scale.toFixed(4)})`;

/** Where a running swing has got to: its keyframes at the effect's eased progress. */
function poseAt({ animation, keys }: { animation: Animation; keys: Pose[] }): Pose {
  const p = animation.playState === "finished" ? 1 : (animation.effect?.getComputedTiming().progress ?? 1);
  const [a, b, t] = p < SWING_PEAK ? [keys[0], keys[1], p / SWING_PEAK] : [keys[1], keys[2], (p - SWING_PEAK) / (1 - SWING_PEAK)];
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, scale: a.scale + (b.scale - a.scale) * t };
}

// Which quality tier of the 3D render a device gets (the numbers are in
// `saturn-webgl.ts`). A mouse and a wide window is a laptop or desktop;
// anything else is a tablet. A phone has no planet at all, upright (under
// 700px wide) or on its side (under 500px tall) — the scene is `display: none`
// there (see "Saturn" in globals.css) and the render is never downloaded.
const PLANET_MQ = "(min-width: 700px) and (min-height: 500px)";
const DESKTOP_MQ = "(hover: hover) and (pointer: fine) and (min-width: 1024px)";

function saturnTier(): SaturnTier | null {
  if (!matchMedia(PLANET_MQ).matches) return null;
  return matchMedia(DESKTOP_MQ).matches ? "desktop" : "tablet";
}

// The panes that carry a lit rim (the `::before` rule in globals.css).
const RIMMED = ".panel,.panel-raised,.panel-rail,.panel-track,.panel-track-block,.panel-control";
// The body's radius as a share of the view box (`saturn-profile.ts`).
const BODY = 0.21;
// How far past the limb the planet's light reaches a pane, and how far along
// the pane's edge it carries, in body radii.
const CATCH_REACH = 1.3;
const CATCH_SPAN = 1.1;

function hydrated(el: Element) {
  return Object.keys(el).some((key) => key.startsWith("__reactFiber"));
}

/**
 * The planet's light on the glass: for every rimmed pane near the planet,
 * where the planet's centre is relative to the pane, how far its nearest
 * edge is and how strong the light is there. Written only when a value
 * changes; panes out of reach are set dark once and left alone.
 */
function placeCatch(view: HTMLElement, strength: number, lit: WeakMap<Element, string>) {
  const v = view.getBoundingClientRect();
  const cx = v.left + v.width / 2;
  const cy = v.top + v.height / 2;
  const body = v.width * BODY;
  // Every box is read before anything is written: a write between two reads
  // makes the second read lay the page out again, once per pane per frame.
  // A pane React has not hydrated yet is left alone: a style written onto
  // server-rendered markup before hydration is a mismatch React reports.
  // React marks a node it owns with a `__reactFiber` key; the next pass
  // (content arriving, a scroll) picks the pane up.
  const panes = [...document.querySelectorAll<HTMLElement>(RIMMED)]
    .filter(hydrated)
    .map((el) => ({ el, r: el.getBoundingClientRect() }));
  for (const { el, r } of panes) {
    const d = Math.hypot(Math.max(r.left - cx, 0, cx - r.right), Math.max(r.top - cy, 0, cy - r.bottom));
    const k = Math.max(0, 1 - Math.max(0, d - body) / (body * CATCH_REACH));
    const catchValue = Math.round(k * k * strength * 100) / 100;
    const x = Math.round(cx - r.left);
    const y = Math.round(cy - r.top);
    const key = catchValue ? `${catchValue}|${x}|${y}|${Math.round(d)}` : "0";
    if (lit.get(el) === key || (key === "0" && !lit.has(el))) continue;
    // Out of reach: the light goes out where it was, rather than travelling
    // off to nowhere while it fades.
    if (key === "0") {
      el.style.setProperty("--catch", "0");
      lit.delete(el);
      continue;
    }
    lit.set(el, key);
    el.style.setProperty("--catch", String(catchValue));
    el.style.setProperty("--catch-x", `${x}px`);
    el.style.setProperty("--catch-y", `${y}px`);
    el.style.setProperty("--catch-d", `${Math.round(d)}px`);
    el.style.setProperty("--catch-r", `${Math.round(d + body * CATCH_SPAN)}px`);
  }
}

export function SaturnStage({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const sceneRef = useRef<HTMLDivElement>(null);
  const probeRef = useRef<HTMLSpanElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const renderRef = useRef<SaturnRender | null>(null);

  // A route change moves the camera (see DEPTHS). The planet's own move is
  // the `saturn-view` transition; the depths are animated here, added onto
  // their sway, from where the last move had got them to. Not on the first
  // load, not on a phone, never under reduced motion. Each depth is a layer
  // that is already its own texture, so nothing is repainted.
  const shownPath = useRef(pathname);
  const travel = useRef<{ animation: Animation; keys: Pose[] }[]>([]);
  useEffect(() => {
    const scene = sceneRef.current;
    const probe = probeRef.current;
    // Where this route puts the planet: its centre in px and its scale.
    const placement = () => {
      if (!scene || !probe) return null;
      const box = getComputedStyle(probe);
      const scale = Number.parseFloat(getComputedStyle(scene).getPropertyValue("--saturn-scale"));
      const x = Number.parseFloat(box.width);
      const y = Number.parseFloat(box.height);
      // Nothing to read on a phone, where the scene is not displayed.
      if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
      return { x, y, scale: Number.isFinite(scale) ? scale : 1 };
    };
    if (shownPath.current === pathname) return;
    shownPath.current = pathname;
    // The planet's light goes out until the new page is at rest (below).
    document.documentElement.dataset.traveling = "";
    if (!matchMedia(PLANET_MQ).matches || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // From where the planet is on screen now — mid-move, if a click comes
    // before the last move landed — to where this route puts it.
    const view = scene?.firstElementChild;
    const to = placement();
    if (!(view instanceof HTMLElement) || !to) return;
    const r = view.getBoundingClientRect();
    const from = { x: r.left + r.width / 2, y: r.top + r.height / 2, scale: r.width / view.offsetWidth };

    const root = getComputedStyle(document.documentElement);
    // A browser may hand the time back as "1s" rather than as written.
    const time = root.getPropertyValue("--camera-duration").trim();
    const duration = Number.parseFloat(time) * (time.endsWith("ms") ? 1 : 1000) || 1000;
    const easing = root.getPropertyValue("--camera-ease").trim() || "ease-in-out";
    const zoom = to.scale / from.scale;
    // A move that starts before the last has landed starts from where that
    // one had got the stars to, so a quick second click never snaps them.
    const previous = travel.current;
    travel.current = DEPTHS.flatMap(({ selector, share, dolly }, i) => {
      const el = document.querySelector<HTMLElement>(`.night-sky ${selector}`);
      if (!el) return [];
      const now = previous[i] ? poseAt(previous[i]) : REST;
      previous[i]?.animation.cancel();
      const peak = {
        x: (to.x - from.x) * share,
        y: (to.y - from.y) * share,
        scale: zoom ** dolly,
      };
      const keys = [now, peak, REST];
      const animation = el.animate(
        keys.map((k, n) => ({ offset: [0, SWING_PEAK, 1][n], transform: transformOf(k) })),
        { duration, easing, composite: "add" },
      );
      return [{ animation, keys }];
    });
  }, [pathname]);

  // The planet's light on the glass (see `placeCatch`). It is never followed
  // frame by frame: rewriting it every frame repainted every lit rim every
  // frame, through a scroll and through a route change alike. Instead the
  // light goes out while the page moves — a scroll (`data-scrolling`) or a
  // route change (`data-traveling`, set above) — and is placed again once
  // the page is at rest, coming back up there through the rim's own
  // transition. Nothing is lit until the planet is drawn, and nothing at all
  // on a phone, which has no planet.
  useEffect(() => {
    const scene = sceneRef.current;
    const view = scene?.firstElementChild;
    if (!scene || !(view instanceof HTMLElement)) return;

    const root = document.documentElement;
    const planetMq = matchMedia(PLANET_MQ);
    let lit = new WeakMap<Element, string>();
    let settle = 0;

    // The drawn fallback is seen through the glass at --saturn-glass
    // throughout, so it throws less light than the render.
    const strength = () => {
      const three = scene.dataset.three;
      return three === "on" ? 1 : three === "off" ? 0.5 : 0;
    };
    const place = () => {
      if (planetMq.matches) {
        placeCatch(view, strength(), lit);
        return;
      }
      for (const el of document.querySelectorAll<HTMLElement>(RIMMED)) el.style.removeProperty("--catch");
      lit = new WeakMap();
    };
    // Placed while still out, then let back up a frame later, so the light
    // never visibly jumps along a rim.
    const rest = () => {
      place();
      requestAnimationFrame(() => {
        delete root.dataset.scrolling;
        delete root.dataset.traveling;
      });
    };
    const onScroll = () => {
      if (!("scrolling" in root.dataset)) root.dataset.scrolling = "";
      window.clearTimeout(settle);
      settle = window.setTimeout(rest, 140);
    };

    const sceneObserver = new MutationObserver(place);
    sceneObserver.observe(scene, { attributes: true, attributeFilter: ["data-three"] });
    const stopWatching = watchPageRest({ scene, onRest: rest });
    window.addEventListener("scroll", onScroll, { passive: true });
    planetMq.addEventListener("change", place);
    // After the first load's own work, so the panes have been hydrated.
    const start = window.requestIdleCallback
      ? window.requestIdleCallback(place, { timeout: 2000 })
      : window.setTimeout(place, 600);

    return () => {
      sceneObserver.disconnect();
      stopWatching();
      window.removeEventListener("scroll", onScroll);
      planetMq.removeEventListener("change", place);
      window.clearTimeout(settle);
      if (window.cancelIdleCallback) window.cancelIdleCallback(start);
      else window.clearTimeout(start);
      delete root.dataset.scrolling;
      delete root.dataset.traveling;
    };
  }, []);

  // The 3D render. Imported once the browser is idle, so it never competes
  // with the page's own first paint, and rebuilt when the tier or the motion
  // preference changes. Under reduced motion it still draws, but as a still.
  // A device that gives no WebGL context, or cannot hold the frame rate, is
  // marked `data-three="off"` and shown the drawn planet instead.
  useEffect(() => {
    const scene = sceneRef.current;
    const box = boxRef.current;
    if (!scene || !box) return;

    const reducedMq = matchMedia("(prefers-reduced-motion: reduce)");
    const tierMqs = [matchMedia(DESKTOP_MQ), matchMedia(PLANET_MQ)];
    let attempt = 0;
    let tooSlow = false;

    const stop = () => {
      attempt++;
      renderRef.current?.dispose();
      renderRef.current = null;
    };
    const fallBack = () => {
      scene.dataset.three = "off";
    };

    const sync = async () => {
      stop();
      const tier = saturnTier();
      if (tooSlow || !tier) return;
      const mine = attempt;
      const { mountSaturn } = await import("@/components/saturn-webgl");
      if (mine !== attempt) return;
      renderRef.current = mountSaturn(scene, box, {
        tier,
        still: reducedMq.matches,
        onTooSlow: () => {
          tooSlow = true;
          stop();
          fallBack();
        },
      });
      if (!renderRef.current) fallBack();
    };

    const idle = window.requestIdleCallback
      ? window.requestIdleCallback(() => void sync(), { timeout: 2000 })
      : window.setTimeout(() => void sync(), 600);
    const onChange = () => void sync();
    for (const mq of [reducedMq, ...tierMqs]) mq.addEventListener("change", onChange);

    return () => {
      if (window.cancelIdleCallback) window.cancelIdleCallback(idle);
      else window.clearTimeout(idle);
      for (const mq of [reducedMq, ...tierMqs]) mq.removeEventListener("change", onChange);
      stop();
    };
  }, []);

  return (
    <div ref={sceneRef} className="saturn-scene" data-view={saturnViewFor(pathname)} aria-hidden>
      <div className="saturn-view">
        <div ref={boxRef} className="saturn-drift">
          {children}
        </div>
      </div>
      {/* Resolves this route's placement to px for the camera (above). */}
      <span ref={probeRef} className="saturn-probe" />
    </div>
  );
}
