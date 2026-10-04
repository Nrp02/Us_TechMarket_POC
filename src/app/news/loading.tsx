import { SkeletonPage } from "@/components/skeleton";

// News's shape, in page.tsx order: title, the tab row with the date picker,
// the sector pills (Stock News is the default tab), then the list. Heights
// are measured off the rendered page (2026-09-25) at the widths where each
// row wraps.
export default function Loading() {
  return (
    <SkeletonPage>
      {/* The display title; its size is a clamp, so it steps with the width. */}
      <div
        data-enter="0"
        className="h-[122px] min-[600px]:h-[70px] min-[1000px]:h-[75px] xl:h-[86px]"
        aria-hidden
      />
      {/* The tab track is a pill of the same material, so it is part of the
          shape rather than something that appears late. The row wraps the
          date picker under it below 600. */}
      <div className="h-[96px] min-[600px]:h-[46px]" aria-hidden data-enter="1">
        <div className="panel-track h-[46px] w-[260px] max-w-full" />
      </div>
      {/* Sector pills: three rows, two, then one. */}
      <div className="h-[88px] min-[600px]:h-[56px] min-[1000px]:h-[24px]" aria-hidden data-enter="1" />
      {/* The list's panel is there at once and its first articles arrive on it
          one at a time, as news-list.tsx does. */}
      <div className="panel flex h-[420px] flex-col gap-8 p-5" aria-hidden>
        {["84%", "58%", "72%", "50%"].map((width, i) => (
          <div key={i} className="flex flex-col gap-3" data-enter={String(Math.min(i + 2, 4))}>
            <span className="block h-3 rounded-full bg-surface-soft" style={{ width }} />
            <span className="block h-3 w-[40%] rounded-full bg-surface-soft" />
          </div>
        ))}
      </div>
    </SkeletonPage>
  );
}
