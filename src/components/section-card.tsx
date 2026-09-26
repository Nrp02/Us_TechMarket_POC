import type { ReactNode } from "react";

// Shared "analytical section" card — one AI-written paragraph, optionally
// paired with a chart of the same figures. Today's Story and Market Story
// (the whole-market counterpart) both draw every section from this one
// definition rather than two copies that could drift apart, the same reason
// the Significant Movement rule and computeBreadth are shared rather than
// reimplemented per page.

function StoryBody({ text, chart }: { text: string; chart?: ReactNode }) {
  const body = (
    <p className="text-pretty font-serif text-base leading-relaxed text-ink">{text}</p>
  );
  if (!chart) return body;
  // A true half-and-half split, not a text column with a small chart pinned
  // to its side: the AI's reading on the left, the underlying numbers drawn
  // on the right, each getting equal width once there's room for both. The
  // 600px point is the same one the page already derives its other splits
  // from — two ~260px halves (a comparison row's label+bar+value) plus a
  // 24px gap and the panel's own padding lands there.
  return (
    <div className="grid gap-6 min-[600px]:grid-cols-2 min-[600px]:items-center">
      {body}
      <div className="min-w-0">{chart}</div>
    </div>
  );
}

/**
 * A plain, unelevated card for one analytical section — the same `.panel`
 * base the stat cards use, adapted for prose/chart content instead of a
 * single figure.
 */
export function SectionCard({ text, chart }: { text: string; chart?: ReactNode }) {
  return (
    <div className="panel p-5 sm:p-6">
      <StoryBody text={text} chart={chart} />
    </div>
  );
}
