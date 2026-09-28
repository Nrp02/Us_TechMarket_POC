import { SkeletonPage, SkeletonPanel } from "@/components/skeleton";

// Market's shape, in page.tsx order. Lives in the (market) route group so it
// wraps `/` only: at app/ it was the root boundary, and a hard load of News or
// Stocks showed this skeleton instead of their own.
//
// Heights are measured off the rendered page (NVDA / Market, 2026-09-25) at
// the widths where each block steps, and only the blocks that can reach the
// first 1000px are fitted. Text height varies continuously with width, so
// between steps the fit is approximate.
export default function Loading() {
  return (
    <SkeletonPage>
      {/* The date picker: one panel-control pill, right-aligned. */}
      <div className="flex justify-end" aria-hidden>
        <div className="panel-control h-[38px] w-40" />
      </div>

      {/* The session digest folds with its content: 4 rows, 3, 2, then 1. */}
      <SkeletonPanel
        className="h-[180px] min-[600px]:h-[140px] min-[1000px]:h-[104px] xl:h-[68px]"
        lines={2}
      />

      {/* Market Overview: heading row (its meta wraps below 600), then the
          cards. Grid must stay byte-identical with market-overview.tsx — see
          The Mirrored Grid Rule in DESIGN.md. */}
      <div className="flex flex-col gap-4" aria-hidden>
        <div className="h-[60px] min-[600px]:h-[38px]" />
        <div className="grid grid-cols-2 gap-3 min-[600px]:grid-cols-3 min-[600px]:gap-4 xl:grid-cols-6">
          {Array.from({ length: 6 }, (_, i) => (
            <SkeletonPanel key={i} className="h-[150px] min-[600px]:h-[160px]" lines={3} />
          ))}
        </div>
      </div>

      {/* Market Story opens on the page's one raised card. */}
      <div className="flex flex-col gap-4" aria-hidden>
        <div className="h-[60px] min-[600px]:h-[38px]" />
        <div className="panel-raised flex h-[428px] flex-col justify-center gap-3 p-6 min-[600px]:h-[260px] sm:p-8 min-[768px]:h-[228px] min-[1000px]:h-[200px] xl:h-[160px]">
          <span className="block h-4 rounded-full bg-surface-soft" style={{ width: "92%" }} />
          <span className="block h-4 rounded-full bg-surface-soft" style={{ width: "84%" }} />
          <span className="block h-4 rounded-full bg-surface-soft" style={{ width: "58%" }} />
        </div>
      </div>

      <SkeletonPanel className="h-[260px]" lines={4} />
    </SkeletonPage>
  );
}
