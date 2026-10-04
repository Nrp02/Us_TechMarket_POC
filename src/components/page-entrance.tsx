"use client";

import { useEffect } from "react";

// One entrance per arrival, not two.
//
// A route change shows the route's `loading.tsx` skeleton the moment the link
// is pressed and the page once the server has rendered it, and both are
// `page-enter`. Each started its own entrance from nothing: the skeleton began
// to rise, was replaced a few frames later, and the page rose again from
// blank — the screen went dark twice for one click, which read as a stutter.
//
// So a page that replaces a skeleton does not start over: each of its cards
// is moved forward to where the skeleton's entrance had reached — the
// skeleton marks the same cards in the same order (`data-enter`), so card 2
// takes over from placeholder 2 mid-rise — or, if the skeleton was up longer
// than the arrival, is simply there. A block arriving on its own
// (a first load, a change of date with no skeleton) runs its entrance from
// the start as before.
//
// The work happens in a MutationObserver callback, which runs after React
// inserts the page and before the browser renders it, so the restarted frame
// is never painted. Only the cards' own arrival (their rise, fade and catch
// of light) is moved; a chart drawing inside them skips the wait it has
// already sat through, and keeps its full length.
//
// A change WITHIN a page — another date, another stock, another tab or
// filter — is not an arrival at all. The block is marked
// `data-arrival="update"` before it is painted, and globals.css ("Changing
// what the page shows") swaps the whole choreography for one short fade. A
// change is a navigation that stays in the same section of the product: the
// first segment of the path, so /todays-activity/NVDA to /todays-activity/AMD
// is a change, and the nav to another route is an arrival.

// globals.css, "The page arriving" and "Changing what the page shows".
const ENTRANCES = new Set(["enter-rise", "enter-fade", "enter-catch", "enter-refresh"]);
// The page's own line (globals.css, "The page's line"). Nothing in a
// skeleton stands for it, so it has not been seen: it plays from the start,
// in its own order, when the page comes in.
const LINE = new Set(["line-rise", "word-in", "figure-count", "figure-hold", "plate-fade", "plate-figure-rise"]);
// `SkeletonPage` in skeleton.tsx.
const SKELETON = "[aria-busy]";

const sectionOf = (path: string) => path.split("/")[1] ?? "";

export function PageEntrance() {
  useEffect(() => {
    const main = document.querySelector("main");
    if (!main) return;
    // The skeleton on screen, when it began its entrance, and whether that
    // was an arrival or a change.
    let skeleton: { el: Element; at: number; update: boolean } | null = null;
    // The section the last arrival was in; the first load's is the page's.
    let shown = sectionOf(location.pathname);

    // A change asked for and not yet here. A new date, tab or filter has no
    // skeleton — the page it replaces stays until the new one is rendered,
    // measured at 0.4s for a tab and 1.7s for an uncached day — so the
    // answer to the click is given here: the page's content is marked
    // pending (globals.css dims it, after a beat, so a quick answer never
    // flickers), except the row holding the control that was pressed.
    let giveUp = 0;
    const settle = () => {
      delete main.dataset.pending;
      main.removeAttribute("aria-busy");
      document.querySelector("[data-pending-source]")?.removeAttribute("data-pending-source");
    };
    const onClick = (event: MouseEvent) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(link instanceof HTMLAnchorElement) || link.target || link.origin !== location.origin) return;
      if (link.pathname + link.search === location.pathname + location.search) return;
      if (sectionOf(link.pathname) !== sectionOf(location.pathname)) return;
      settle();
      link.closest(".page-enter > *")?.setAttribute("data-pending-source", "");
      main.dataset.pending = "";
      main.setAttribute("aria-busy", "true");
      // A navigation that never lands (a failed request) must not leave the
      // page dimmed.
      window.clearTimeout(giveUp);
      giveUp = window.setTimeout(settle, 10000);
    };
    document.addEventListener("click", onClick, true);

    const observer = new MutationObserver((records) => {
      const now = performance.now();
      let arrived = false;
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (!(node instanceof Element)) continue;
          const block = node.matches(".page-enter") ? node : node.querySelector(".page-enter");
          if (!block) continue;
          arrived = true;
          settle();
          // The first load's page streamed in behind its skeleton is not a
          // navigation, and it is not React's yet: it is swapped into the
          // server's HTML before hydration, so marking it would be a
          // hydration mismatch and would play a first visit as a change.
          // It arrives on its own clock. (A block a navigation renders has
          // its fiber from the moment it is created.)
          if (!Object.keys(block).some((key) => key.startsWith("__reactFiber"))) {
            shown = sectionOf(location.pathname);
            skeleton = null;
            continue;
          }
          const isSkeleton = block.matches(SKELETON);
          const replacing = skeleton;
          // A page replacing its skeleton is the same navigation, and takes
          // the skeleton's verdict.
          const section = sectionOf(location.pathname);
          const update = replacing && !isSkeleton ? replacing.update : section === shown;
          if (update) (block as HTMLElement).dataset.arrival = "update";
          shown = section;
          skeleton = isSkeleton ? { el: block, at: now, update } : null;
          if (!replacing) continue;
          const elapsed = now - replacing.at;
          for (const animation of block.getAnimations({ subtree: true })) {
            if (!(animation instanceof CSSAnimation)) continue;
            if (ENTRANCES.has(animation.animationName)) {
              animation.currentTime = elapsed;
              continue;
            }
            if (LINE.has(animation.animationName)) continue;
            // An instrument waits for its card to land before it draws (a
            // chart's line, a breadth bar); skip the part of that wait that
            // has passed, and play the drawing in full.
            const delay = Number(animation.effect?.getTiming().delay ?? 0);
            animation.currentTime = Math.min(elapsed, delay);
          }
        }
      }
      // A skeleton replaced by something else (an error) has nothing to hand on.
      if (!arrived && skeleton && !skeleton.el.isConnected) skeleton = null;
    });
    observer.observe(main, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      document.removeEventListener("click", onClick, true);
      window.clearTimeout(giveUp);
      settle();
    };
  }, []);

  return null;
}
