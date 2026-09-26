# 02: Today's Story — deeper reasoning, with a real analysis guideline

**What to build:** Reading a generated Today's Story now reads as analysis, not restatement — every section (not just 2 of 8) may reason across the full set of the day's data, guided by a small, separately-editable set of analyst-derived reasoning principles (context before attribution, corroborate a lone divergence before calling it decisive, state what an explanation does and doesn't cover, describe before attributing cause, don't let an unusual day imply a future trend). The opening section reads as a short "What Happened" overview distinct from the 7 deeper analytical sections beneath it. News-grounded reasoning draws on the article's actual paraphrased content, not just its headline.

**Blocked by:** 01 (soft dependency — this ticket's own verification spot-checks that the fundamentals section is genuinely reconciled with price/peer data, which requires ticket 01's fix to be live so there's real fundamentals data to check against; there is no hard code dependency between the two)

**Status:** ready-for-agent

Full detail:
- [`../../todays-story-reasoning/spec.md`](../../todays-story-reasoning/spec.md) — the prompt rewrite, `news_summaries` wiring, relative-volume exposure, "What Happened" widening, Groq `reasoning_effort`/token-ceiling tuning
- [`../../todays-story-guideline/spec.md`](../../todays-story-guideline/spec.md) — the researched analysis-guideline module and its 5 principles

This ticket **merges** those two specs into one deliverable: the guideline module is not independently verifiable on its own (it's inert until imported), so it ships together with the prompt rewrite it's designed to be interpolated into, as one demoable slice — generate a real story and read genuine analysis in it.

- [ ] The "already computed, state it, do not re-derive it" hints are removed from the prompt's input-shape labels
- [ ] The causal-inference rule now applies to all 8 sections (previously scoped to 2), replaced by a grounding-in-input guardrail
- [ ] The blanket "1-3 sentences" cap is removed for the 7 analytical sections; the headline/"What Happened" section stays short
- [ ] The headline section is widened into a "What Happened" overview (price move + top news pick + reason), UI copy and disclosure footer updated to match
- [ ] Raw relative-volume figure is added to the prompt's price input block
- [ ] `news_summaries`' AI paraphrase is wired into the "news today" prompt block, falling back to headline when absent
- [ ] A new analysis-guideline module exists as a separately-editable constant (not inline in the prompt-building function), containing the 5 researched principles, imported and interpolated into the assembled prompt
- [ ] Groq call sets an explicit `reasoning_effort` (default high, falling back to medium if measured token usage runs too close to the ceiling) and an explicit `max_completion_tokens` ceiling, set from a real measurement
- [ ] Story job manually triggered for a handful of stocks; token usage confirmed comfortably under half the per-minute budget
- [ ] Generated sections for 2-3 stocks spot-checked against raw price/peer/fundamentals/news data: every claim traceable, fundamentals genuinely reconciled with price/peer action, no invented facts, no section repeating an earlier section's conclusion, peer/sector context established before company-specific attribution, partial explanations stated honestly rather than forced into a complete-sounding story
- [ ] `/todays-activity/[symbol]` checked in-browser at a wide and a ~600px viewport for clean layout with longer section text
- [ ] The project's build docs record the reversal (causal-inference rule now project-wide, sentence cap removed) and the settled `reasoning_effort`/token-ceiling values
- [ ] `npx tsc --noEmit` and `npm run lint` clean
