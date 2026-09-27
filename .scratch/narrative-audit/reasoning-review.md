# Reasoning quality follow-up audit

Goal: make the narrative explain the best-supported interpretation from engine outputs and dated business evidence, rather than translate labels or enumerate facts.

## Reproduction and hypotheses

Offline reproduction uses committed compose-editorial.mts, authored-draft.json, editorial-notes.txt and retained historical-inputs.json. Inspecting the construction of the same 100 stored stock sections deterministically establishes which parts are templates; no provider replay is required for that finding.

1. Guideline/engine omitted globally: disproved for scheduled path. buildStoryInput feeds computed features; buildStoryPrompt interpolates ANALYSIS_GUIDELINE before generateJson.
2. Replacement backfill bypasses per-section reasoning: confirmed. compose-editorial lines94/97 generate comparison, classification, unusualness, peerSectorRelation and ytdTakeaway via conditional templates. Only explanation and business have independently authored notes; headline repeats explanation first sentence.
3. Missing all news: disproved. Every stock-news input has a summary (276/263/328/264/262 daily stock associations, not distinct articles). Prompt consumes summary instead of original provider snippet.
4. Historical corroboration limited: confirmed. All100 stock inputs have null numerical fundamentals and relative volume; historical macro arrays empty. Safe as-of handling is correct, but no archived earlier business observations exist. This limits corroboration; it does not justify template prose.
5. Quality enforced before persistence: disproved. Scheduled checks only nonempty strings/key coverage; CLI also checks dates/coverage/trend location, not evidence-to-inference quality. Existing row suppresses automatic regeneration.

## Findings and smallest useful correction

- Stop composing the five analytical stock sections with code; engine supplies facts, author/model supplies interpretation for every section.
- Prompt's descriptive-first rule and exact explanation fallback compete with partial reasoning instruction. Make explanation request a best-supported interpretation, explicit mechanism grounded in article content, evidence for/against, and unresolved component; permit no confirmed driver while still interpreting available engine patterns. Do not assert proven causation from co-movement.
- Connecting two numbers is insufficient: distinguish a relationship summary from an explanation of why one interpretation fits better than alternatives. Require evidence and an inference, not an arbitrary sentence length.
- Preserve source snippets/dated business observations where available; summaries alone are lossy. Filing form/item codes cannot support detailed business mechanisms. Do not fabricate missing historical numerical fundamentals/volume.
- Validate grounded analytical evidence against representative complete inputs before bulk persistence. Current checks/test success demonstrate structure/numeric behavior, not narrative reasoning quality.
- Low reasoning effort was chosen for two calls/tick throughput. It is a tuning hypothesis, not a demonstrated cause; compare complete same inputs under paced calls before changing effort/model. No provider performance claim made in this audit.

## Deployment verification

Prior patch deployment READY at ca7eeed; Data cache purged. All105 public pages returned200; all840 authored visible sections matched. This proves delivery of the draft, not quality of reasoning. No narrative DB rewrite or code patch made during this audit.

## Implementation / live checks

Shared generation now authors all narrative sections with structured engine input and selected dated source evidence, validates receipt/numeric/trend constraints, then independently reviews final conclusions. Rejections persist feedback for the next attempt. Business context is retained across sessions; provider excerpts are stored separately from paraphrases, including when no new summary is needed.

-192 tests passed; TypeScript and targeted ESLint passed. Isolated webpack production build passed; Turbopack cannot follow node_modules symlink outside the temporary build root, an isolation artifact rather than app compile failure.
- NVDA25 produced a complete accepted candidate. Human reading identified excessive confidence in prior ETF-allocation commentary; guideline/reviewer tightened.
- Market23 remains under iteration: false significant-count inference, missing VIXY trend facts, missing-cache fallacy and one provider schema400. Rejected candidates are retained locally, never published.
- Fixed prior-session timestamp false rejection: time-of-day alone is insufficient; compare article session to analyzed session.
- Removed stock-specific receipt instructions from market contract; these referenced nonexistent market fields and competed with market schema.
- Resumable five-day generation began; pacing65sec against measured8000TPM. A429 showed requested5671 with4546 already used: this is the per-minute budget, not missing credentials or daily quota. No replacement published yet.
