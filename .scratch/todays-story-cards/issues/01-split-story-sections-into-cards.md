# 01 — Split Today's Story into a card per section

Status: wontfix — superseded by [`todays-story-followups`](../../todays-story-followups/issues/04-split-story-into-cards.md) ticket 04 (same scope, renumbered into the consolidated dependency-ordered set from `/to-tickets`). This spec is still the detailed reference; only this ticket file is superseded.

Spec: [`../spec.md`](../spec.md)

## Summary

1. Break the single Today's Story panel into: one elevated "What Happened" lede card (keeps the existing corner-wash elevated treatment), followed by a vertical stack of 7 plain analytical cards, one per section, built from this page's existing card material (the same base its numeric stat cards use).
2. Keep the three charted sections' existing responsive text/chart split behavior unchanged, just scoped to each card's own width.
3. Preserve section order and content exactly — layout-only change.

## Verification checklist

- [ ] `npx tsc --noEmit` clean
- [ ] `npm run lint` clean
- [ ] Browser check: all 8 cards render distinctly and in order for a stock with a real story
- [ ] "What Happened" visually distinct (elevated) from the 7 analytical cards
- [ ] Charted sections show chart+text side-by-side at wide viewport, stacked at narrow viewport
- [ ] A very long generated section doesn't visually break the stack
- [ ] Responsive check at both a wide and a narrow (~600px and below) viewport

## Comments
