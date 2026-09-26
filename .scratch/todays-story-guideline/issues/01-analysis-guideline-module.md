# 01 — An editable analysis guideline for Today's Story

Status: wontfix — superseded by [`todays-story-followups`](../../todays-story-followups/issues/02-todays-story-deeper-reasoning.md) ticket 02, which merges this with the reasoning-rewrite ticket into one demoable slice per `/to-tickets` vertical-slicing (this module alone isn't independently verifiable — it's inert until imported into the prompt). This spec is still the detailed reference; only this ticket file is superseded.

Spec: [`../spec.md`](../spec.md)

Depends on / composes with: `.scratch/todays-story-reasoning/issues/01-give-todays-story-real-reasoning.md` (implement together, or this one second — see spec's "Composition" note: this ticket only changes *where* the reasoning-instruction text lives, not any of that ticket's other decisions).

## Summary

1. Add a new module exporting the analysis-guideline text as a plain string constant (mirrors this codebase's existing prompt-adjacent constants, e.g. the fixed fallback lines already defined alongside the narrative-generation code).
2. Content (5 principles, all scoped to fields already in Today's Story's structured input):
   - Establish peer/sector/market context before attributing a move to the company specifically.
   - Treat a lone peer/sector divergence as a signal needing corroboration (volume, fundamentals, news), not proof on its own.
   - State explicitly what an explanation accounts for and what it leaves unexplained when the data only partially supports a clean story.
   - Default to descriptive/observational phrasing; causal language only where the existing grounding rule already permits it.
   - Reinforce (don't duplicate) the "no predicting future trends" rule at the phrasing level — a statistically unusual day describes today, not tomorrow.
3. Import the guideline constant into the prompt-building function; interpolate into the assembled prompt alongside the per-section JSON-schema instructions and the hard rules from `todays-story-reasoning` — guideline text and schema-assembly logic stay in separate places.

## Verification checklist

- [ ] `npx tsc --noEmit` clean
- [ ] `npm run lint` clean
- [ ] Spot-check (can be folded into `todays-story-reasoning`'s own spot-check pass): a peer/sector-divergence section establishes context before attributing cause
- [ ] Spot-check: a section with only partially-supporting data states what it does/doesn't account for, rather than forcing a complete-sounding story
- [ ] Spot-check: no section's phrasing drifts into implying persistence of an unusual move into the future

## Comments
