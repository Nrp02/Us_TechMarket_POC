// The stored shape of both AI narratives: what the generation jobs write to
// `stories` / `market_stories` and what the pages read back. One definition,
// so adding a section is one edit that the compiler then carries to the job,
// the read model and the backfill script. Pure data — no database or upstream
// import — which is what lets pages import it without breaching the
// no-restricted-imports rule that keeps them away from the AI jobs.

/** Today's Story's prose sections; `headline` is separate because it is nested. */
export const STOCK_SECTION_KEYS = [
  "comparison",
  "classification",
  "unusualness",
  "explanation",
  "fundamentals",
  "peerSectorRelation",
  "ytdTakeaway",
] as const;

/**
 * `headline` carries the picked article resolved server-side from the model's
 * pick — never a URL or headline the model wrote itself, so it cannot invent one.
 */
export type StorySections = {
  headline: {
    text: string;
    news: { headline: string; sourceUrl: string; publishedAt: string } | null;
  };
  checks?: StoryChecks;
} & Record<(typeof STOCK_SECTION_KEYS)[number], string>;

/**
 * What the automated checks found in a published draft. Drafts are no longer
 * rejected (owner, 2026-09-29): `shown` are factual problems (a figure not in
 * the input, a wrong direction) displayed under their card; `logged` are
 * format problems kept for inspection only. Each entry is "sectionKey: message".
 * Absent on rows written before this existed.
 */
export type StoryChecks = { shown: string[]; logged: string[] };

/** The shown warnings for the given cards, with their "key: " prefix removed. */
export function warningsFor(checks: StoryChecks | undefined, ...keys: string[]): string[] {
  return (checks?.shown ?? []).flatMap((issue) => {
    const key = keys.find((k) => issue.startsWith(`${k}: `));
    return key ? [issue.slice(key.length + 2)] : [];
  });
}

export const MARKET_SECTION_KEYS = [
  "overallRead",
  "standoutMovers",
  "sectorLeadership",
  "breadth",
  "marketEvents",
  "macroContext",
  "volatilityContext",
  "closingSynthesis",
] as const;

export type MarketStorySections = Record<(typeof MARKET_SECTION_KEYS)[number], string> & { checks?: StoryChecks };
