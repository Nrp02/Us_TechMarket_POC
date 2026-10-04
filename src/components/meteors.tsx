"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

/** Fired when a client-initiated request has changed what the page shows. */
export const DATA_ARRIVED = "ustm:data-arrived";

// The only client component in the product that exists for something visual,
// and it is here because the thing it responds to cannot be known on the
// server: a route change and a watchlist mutation both leave the fixed sky
// layer mounted, so nothing in it would ever re-run.
//
// It holds one number. No listeners beyond a single window event, no timers,
// no animation loop — the motion is CSS, and this only decides when to start
// it over.
//
// WHY A KEY RATHER THAN A CLASS TOGGLE. Restarting a CSS animation by removing
// and re-adding a class needs a forced reflow between the two to take effect,
// which is a layout thrash on a layer sitting behind eight backdrop-filters.
// Changing the key unmounts the spans and mounts new ones, and a new element
// runs its animation from the beginning by definition.
export function Meteors() {
  const pathname = usePathname();
  const [flight, setFlight] = useState(0);

  useEffect(() => {
    const onArrive = () => setFlight((n) => n + 1);
    window.addEventListener(DATA_ARRIVED, onArrive);
    return () => window.removeEventListener(DATA_ARRIVED, onArrive);
  }, []);

  return (
    // Fixed and behind the content at the same depth as the sky itself, so the
    // meteors pass BEHIND the glass rather than across it. A streak over the
    // panels would be an effect on the interface; behind them it is weather,
    // which is the only thing in this world allowed to move.
    //
    // `overflow-hidden` matters: the paths start a full viewport off the right
    // edge, and without it the document would gain a horizontal scrollbar for
    // the second and a bit that they are out there.
    <div
      key={`${pathname}:${flight}`}
      // -z-[1], NOT -z-10, and the difference is the whole feature. `night-sky`
      // sits at z-index -1 and paints an OPAQUE --color-backdrop, so anything
      // behind it is not dimmed, it is gone: at -10 the meteors ran their full
      // 1.15s underneath a solid black sheet, every time, invisibly. Verified
      // by seeking a paused flight to mid-path and screenshotting at each
      // depth — nothing at -10, both streaks at -1.
      //
      // Equal z-index with the sky is correct rather than a workaround: this
      // element comes after <NightSky /> and <SaturnScene /> in the layout, so
      // at the same level it paints on top of the sky and the planet and still
      // behind every panel, which is where weather belongs.
      className="pointer-events-none fixed inset-0 -z-[1] overflow-hidden"
      aria-hidden
    >
      <span className="meteor meteor-lead" />
      <span className="meteor meteor-trail" />
    </div>
  );
}
