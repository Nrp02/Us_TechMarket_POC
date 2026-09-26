# Split Today's Story into a card per section

## Problem Statement

Today's Story currently renders all 8 sections — the "What Happened" lede plus 7 analytical sections, three of them carrying a data-visualization chart — inside one single large panel. With the reasoning-depth changes landing separately (removing the per-section sentence cap so analytical sections can run much longer), that single panel gets denser and harder to visually parse: there's no separation between sections beyond a label and vertical spacing, so a page that's meant to read as a structured briefing instead reads as one long, undifferentiated block, described by the project owner as "แน่น เละ" (cramped, messy).

## Solution

Break Today's Story out of its single container into one visually distinct lede card ("What Happened") followed by a vertical stack of individually-bordered cards, one per analytical section, reusing this page's existing card material system rather than inventing a new one. Sections carrying a chart keep their existing internal two-column text+chart treatment, now scoped to their own card's width instead of the old panel's full width; sections without a chart become plain single-column card content.

## User Stories

1. As a visitor, I want each Today's Story section visually separated into its own card, so I can tell where one topic ends and the next begins without relying on label text alone.
2. As a visitor, I want the "What Happened" overview to look visually distinct from the 7 analytical sections beneath it, so the page's own structure signals "summary, then analysis" the way the content itself is now written to.
3. As a visitor, I want the three chart-carrying sections (peer/sector/market comparison, unusual-vs-history, year-to-date) to keep showing their chart alongside the text on a wide screen, so nothing about the existing chart presentation regresses when the layout changes.
4. As a visitor, I want the sections to remain in a single top-to-bottom reading order (not a multi-column grid), so the page still reads as one continuous briefing rather than a dashboard of disconnected tiles — this matters more now that section length varies a lot more than before.
5. As a visitor on a phone or narrow viewport, I want the per-card layout to behave the same way the existing chart/text split already does at narrow widths (stacking), so this change doesn't regress the page's existing responsive behavior.
6. As the project owner, I want the new cards built from this page's existing card material system (the same base every other card function-uses), not a hand-assembled one-off style, so the change doesn't introduce a second visual language for "card" on the same page.
7. As the project owner, I want this treated purely as a layout/composition change with no effect on the underlying content contract (all 8 sections, their order, their data, their charts) so it can ship independently of the reasoning-depth changes to the sections' actual text.

## Implementation Decisions

- **Material**: every new card is built from this project's existing panel material system, not hand-assembled styling — the "What Happened" lede keeps the same elevated treatment (with its corner wash) it already has today as the single big panel's own surface; the 7 analytical sections below it become plain, unelevated cards using this page's other existing card material — the same base already used by this page's 7 numeric stat cards, adapted for prose/chart content instead of a single figure.
- **Layout**: a single vertical stack, not a multi-column grid. This page's existing numeric stat-card grid (which does go multi-column at wider breakpoints) is a deliberate non-precedent here — those cards are uniform-height numbers; these are prose sections of highly variable length, and stacking preserves the "read top to bottom as one briefing" framing the narrative content itself is written for.
- **Chart-carrying sections**: the three sections that already render a chart keep their existing internal responsive behavior — text and chart side-by-side above the width breakpoint this page already uses for that exact pattern, stacked below it — now evaluated against each card's own (narrower) width rather than the old single panel's full width. No new breakpoint math; the existing per-section component's existing behavior is reused as-is, just inside a narrower container.
- **Section order**: unchanged — "What Happened" first, then the 7 analytical sections in their existing order.
- **Content**: unchanged by this ticket — this is a layout-only change. The prose content, length, and any prompt-side changes belong to the separate reasoning-depth ticket landing alongside this one; this ticket assumes whatever text each section produces (short or long) and lays it out.

## Testing Decisions

- No automated test seam is added — this repository has zero component test files of any kind; every layout/responsive change in its history has been verified manually in a real browser (including, for prior narrow-viewport work, an in-page same-origin iframe technique to measure real rendered widths rather than relying on a resize tool that doesn't reliably work in this environment).
- Verification is manual: load the page for a stock with a real generated story and confirm all 8 cards render distinctly, in order, with the lede visually distinguished from the analytical cards; confirm the three charted sections still show their chart at a wide viewport and stack correctly at a narrow one; check at least one very long generated section (post reasoning-depth-ticket) to confirm a single very long card doesn't visually break the stack.
- Type-check and lint clean, as usual.

## Out of Scope

- Any change to section content, length, or the underlying prompt — that's the separate reasoning-depth ticket.
- A multi-column or masonry arrangement of the analytical cards — explicitly rejected in favor of a single vertical stack.
- Adding icons, numbering, or other new visual affordances to the section cards beyond what this page's existing card material already provides.
- Changing which sections carry a chart, or adding new charts to currently-chartless sections.

## Further Notes

- This spec's decisions came out of the same grilling session (Thai-language) as the SEC-filings-signal spec: the project owner confirmed reusing the existing card material, a single-column stack over a grid, the "What Happened" lede keeping its distinct elevated treatment, and the charted sections keeping their existing responsive split unchanged.
- This ticket is independent of and can land before, after, or alongside the reasoning-depth ticket and the SEC-filings-signal ticket — it touches only presentation, not the data or prompt those two tickets change.
