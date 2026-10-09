# ADR 0006 — One Significant Movement rule, defined once and imported everywhere

- **Status:** Accepted
- **Decided:** 2026-08-14 (`src/lib/significance.ts`, commit `84f5e21`)
- **Recorded:** 2026-10-10

## Context

"Is this move unusual?" appears in the status badge, Top Movers ranking, the stock page badge, the Market Story's significant-move count and the AI prompts. If each re-implemented it, the same stock could be "significant" on one surface and "normal" on another. A past version hardcoded `significant: false` in one path, and the Market Story reported zero significant moves beside a page that showed several.

## Decision

```
|change| ≥ 5%  OR  relVol ≥ 2.5x  OR  (|change| ≥ 3% AND relVol ≥ 1.5x)  → Significant
```

It is defined once in `significance.ts` and imported by every surface. Thresholds are named constants (`PCT_STRONG`, `RVOL_STRONG`, `PCT_COMBO`, `RVOL_COMBO`). A plain-language statement of the rule is the hover text on the badge, since the badge cannot explain its own threshold.

The significance count is **Top-20-only** and is labelled so in the interface and in the Market Story prompt; breadth and movers cover all 43 tracked stocks.

## Consequences

- Changing a threshold changes every surface together.
- A missing relative volume leaves only the change-based triggers; it is never treated as normal volume.
- The thresholds are a product judgment, not a statistical result, and say nothing about cause.
