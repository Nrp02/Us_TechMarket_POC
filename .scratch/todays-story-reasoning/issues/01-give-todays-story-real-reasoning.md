# 01 — Give Today's Story real reasoning, not just restatement

Status: wontfix — superseded by [`todays-story-followups`](../../todays-story-followups/issues/02-todays-story-deeper-reasoning.md) ticket 02, which merges this with the analysis-guideline ticket into one demoable slice per `/to-tickets` vertical-slicing. This spec is still the detailed reference; only this ticket file is superseded.

Spec: [`../spec.md`](../spec.md)

## Summary

Implement the spec in full:

1. Rewrite `buildPrompt` in `src/lib/story-generation.ts`:
   - Remove the "already computed, state it, do not re-derive it" hints.
   - Remove the rule restricting causal claims to `explanation`/`peerSectorRelation` only; replace with a grounding-in-input guardrail that applies to all 8 sections.
   - Add an explicit anti-redundancy instruction across sections.
   - Rewrite section briefs (especially `fundamentals`) to invite cross-referencing the whole input.
   - Remove the blanket "1-3 sentences" cap for the 7 analytical sections; keep `headline` short.
   - Widen `headline` into a "What Happened" overview (price + top news pick + reason).
   - Add the raw relative-volume figure to the prompt's price block.
   - Join `news_summaries` into `loadNews` and use the paraphrase (falling back to headline when absent) in the "news today" block.
2. `src/lib/groq.ts`: add `reasoningEffort` (default `"high"`) and an explicit `max_completion_tokens` ceiling to `generateJson`; wire through from `story-generation.ts`. Set the ceiling from a measured token count, not a guess.
3. Fundamentals bug fix:
   - Add `scripts/backfill-fundamentals.mts` mirroring `scripts/backfill-daily-closes.mts`, covering `TOP_20_SYMBOLS`, writing to `fundamentals`.
   - Add an `npm run backfill-fundamentals` script entry.
   - Leave `refresh.ts`'s existing staleness re-fetch untouched.
   - Run the backfill script once against production as part of landing this change.
4. `src/components/todays-story.tsx`: update the headline framing/copy and the disclosure footer text to match the project-wide inference rule.
5. `CLAUDE.md`: record the reversal (causal-inference rule now project-wide across all 8 sections, sentence cap removed), the fundamentals bug (symptom/root cause/fix), and the `reasoning_effort`/token-ceiling values settled on during verification.

## Verification checklist

- [ ] `npx tsc --noEmit` clean
- [ ] `npm run lint` clean
- [ ] Backfill script run once; `fundamentals` has rows for all 20 symbols
- [ ] Story job manually triggered for a handful of stocks; token usage read back and confirmed under half the per-minute budget
- [ ] Generated sections for 2-3 stocks spot-checked against raw `price_cache`/`daily_closes`/`fundamentals`/`news` data — every claim traceable, fundamentals reconciled with price/peer action, no invented facts
- [ ] `/todays-activity/[symbol]` checked in-browser at a wide and a ~600px viewport for clean text/chart layout with longer section text

## Comments
