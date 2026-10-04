import { SkeletonPage, SkeletonPanel } from "@/components/skeleton";

// In page.tsx order: stat cards, the chart with the events panel beside it,
// the timeline, the AI Daily Summary, then Today's Story, whose opening card
// is the page's one raised element. The skeleton keeps that rank so the
// hierarchy is legible before a word of the narrative exists.
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
      {/* Heights below are measured off the rendered page (NVDA, 2026-09-25)
          at the widths where each block steps. Only blocks that can reach the
          first 1000px are fitted; text height varies continuously with
          width, so between steps the fit is approximate. */}

      {/* Header: stacks below 600, two rows to 680, one row from 768. On a
          touch screen the date picker is 44px rather than 38, and the header
          is 10-11px taller at every width. */}
      {/* Not empty: it is the first thing the arrival shows, and an empty
          header left the stat cards rising under bare sky. The ticker and the
          price as glass pills on the field, where the real ones sit. */}
      <div
        data-enter="0"
        className="flex items-start gap-4 h-[197px] min-[600px]:h-[169px] min-[680px]:h-[106px] min-[680px]:gap-6 min-[768px]:h-[78px] pointer-coarse:h-[208px] min-[600px]:pointer-coarse:h-[180px] min-[680px]:pointer-coarse:h-[116px] min-[768px]:pointer-coarse:h-[88px]"
        aria-hidden
      >
        <div className="panel-control h-10 w-14 shrink-0" />
        <div className="flex flex-col gap-3">
          <div className="panel-control h-[38px] w-32" />
          <div className="panel-control h-6 w-48" />
        </div>
        <div className="panel-control ml-auto hidden h-[38px] w-36 min-[680px]:block" />
      </div>

      {/* No provenance note: the page draws one only for a past session, and
          a placeholder for it here dropped every card 65px on the usual,
          latest, arrival. */}

      <div className="grid grid-cols-2 gap-3 min-[600px]:grid-cols-3 min-[600px]:gap-4 xl:grid-cols-4">
        {/* Not every row is the same height: the row whose labels wrap (the
            third on a phone, the second in three columns) is taller.
            Measured on NVDA, 2026-10-04; another stock's labels can wrap
            differently. */}
        {Array.from({ length: 7 }, (_, i) => (
          <SkeletonPanel
            key={i}
            enter={String(Math.min(i + 1, 4))}
            className={`${i === 4 || i === 5 ? "h-[153px]" : "h-[141px]"} ${
              i >= 3 && i <= 5
                ? "min-[600px]:h-[161px] min-[768px]:h-[149px]"
                : "min-[600px]:h-[149px] min-[768px]:h-[130px]"
            } min-[1000px]:h-[130px]`}
          />
        ))}
      </div>

      {/* Same tracks as page.tsx, so nothing settles sideways on arrival. The
          chart's height follows its width, so it steps with the column; each
          step is fitted at the device in it (390, 640, 820, 1050, 1180, 1470;
          NVDA, 2026-10-04). */}
      <div className="grid grid-cols-1 gap-10 min-[1130px]:grid-cols-[minmax(0,1fr)_minmax(300px,360px)] min-[1130px]:items-start min-[1130px]:gap-6" data-enter="4">
        <SkeletonPanel
          className="h-[364px] min-[600px]:h-[342px] min-[768px]:h-[381px] min-[1000px]:h-[470px] min-[1130px]:h-[371px] min-[1440px]:h-[484px]"
          lines={4}
        />
        <SkeletonPanel className="h-[219px] min-[600px]:h-[197px] min-[1130px]:h-[219px]" lines={4} />
      </div>

      <SkeletonPanel className="h-[900px]" lines={6} />

      {/* The AI Daily Summary: a plain panel since Today's Story took the
          raised rank. */}
      <SkeletonPanel className="h-[260px]" lines={4} />

      <div className="panel-raised flex flex-col gap-3 p-6 sm:p-8" aria-hidden>
        <span className="block h-4 rounded-full bg-surface-soft" style={{ width: "92%" }} />
        <span className="block h-4 rounded-full bg-surface-soft" style={{ width: "76%" }} />
        <span className="block h-3 rounded-full bg-surface-soft" style={{ width: "44%" }} />
      </div>
    </SkeletonPage>
  );
}
