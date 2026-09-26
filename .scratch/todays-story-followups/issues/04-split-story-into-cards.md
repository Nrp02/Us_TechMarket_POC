# 04: Split Today's Story into a card per section

**What to build:** Today's Story renders as one visually distinct "What Happened" lede card followed by a vertical stack of individually-bordered cards, one per analytical section, instead of one dense panel holding all 8 sections. Chart-carrying sections keep their existing text+chart split, now scoped to their own card's width.

**Blocked by:** None (can start immediately) — pure layout change, works with whatever section text exists at implementation time regardless of ticket 02's status.

**Status:** ready-for-agent

Full detail: [`../../todays-story-cards/spec.md`](../../todays-story-cards/spec.md)

- [ ] "What Happened" keeps the existing elevated (corner-wash) treatment as its own card
- [ ] The 7 analytical sections become plain cards, built from this page's existing card material system (the same base its numeric stat cards use) — no hand-assembled one-off styling
- [ ] Cards are arranged as a single vertical stack, not a multi-column grid
- [ ] The three charted sections keep their existing responsive text/chart split behavior unchanged, now scoped to their own card's width
- [ ] Section order and content are unchanged — layout-only change
- [ ] Browser check: all 8 cards render distinctly and in order for a stock with a real story
- [ ] Browser check: charted sections show chart+text side-by-side at a wide viewport, stacked at a narrow one
- [ ] Browser check: a very long generated section doesn't visually break the stack
- [ ] Responsive check at both a wide and a narrow (~600px and below) viewport
- [ ] `npx tsc --noEmit` and `npm run lint` clean
