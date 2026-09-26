import { SkeletonPage, SkeletonPanel } from "@/components/skeleton";

// The one page with a raised element, and the skeleton keeps that rank: the
// summary card is `panel-raised` here too, so the hierarchy is legible before
// a single word of the narrative exists.
//
// Grid string below must stay byte-identical with activity-stats.tsx — see
// The Mirrored Grid Rule in DESIGN.md. Today's Story widened the real grid
// from 5 cards (xl:grid-cols-5) to 7 (xl:grid-cols-4); this file previously
// still drew the old 5-card skeleton, so cards visibly reflowed the instant
// real content arrived — worst on exactly the slow connection a skeleton
// exists for.
export default function Loading() {
  return (
    <SkeletonPage>
      <div className="h-[92px]" aria-hidden />

      <div className="grid grid-cols-2 gap-3 min-[600px]:grid-cols-3 min-[600px]:gap-4 xl:grid-cols-4">
        {Array.from({ length: 7 }, (_, i) => (
          <SkeletonPanel key={i} className="h-[152px]" />
        ))}
      </div>

      {/* panel-raised, and with bars for the same reason as the rest: the one
          element on the page that outranks its neighbours should still look
          like it while it is empty. Sized for the 8-section Today's Story
          (headline + 7 labelled sections + footer note) rather than the old
          3-field summary it replaced — the old fixed 420px was tuned to six
          lines and left the real card growing ~3x underneath it, which is a
          layout shift no skeleton should be causing. */}
      <div className="panel-raised flex flex-col gap-5 p-6 sm:p-8" aria-hidden>
        {/* Headline: one wide line. */}
        <span className="block h-4 rounded-full bg-surface-soft" style={{ width: "92%" }} />
        {/* Seven labelled sections: a short label bar, then two lines of body. */}
        {Array.from({ length: 7 }, (_, i) => (
          <div key={i} className="flex flex-col gap-2">
            <span className="block h-2.5 w-24 rounded-full bg-surface-soft" />
            <span className="block h-3 rounded-full bg-surface-soft" style={{ width: "94%" }} />
            <span className="block h-3 rounded-full bg-surface-soft" style={{ width: "68%" }} />
          </div>
        ))}
      </div>
    </SkeletonPage>
  );
}
