# Narrative repair and historical replacement

Scope: September 21–25, 2026; 20 deep-analysis stocks per day (100 stock/day stories), plus five Market Stories.

## Shipped behavior

- Fundamentals are continuing business context, not a required new daily event. The prompt compares quarterly YoY/TTM YoY with price/peer performance, distinguishes fiscal period from announcement time, and uses company business news when numerical as-of results are unavailable.
- Migration 0018 archives changed fundamentals with application observation time. Reads select the latest observation by the regular-session close. Initial seed uses the actual cache timestamp; no fabricated historical releases.
- The old literal-template script refuses `--write`. `scripts/backfill-story-analysis.mts` exports historical inputs or uses `--ai` to draft with the actual production generators. Draft review/`--validate` precedes a separate `--write`; writing exports the old rows and verifies every new section by readback.
- Historical inputs use stored closes and the full tracked-symbol list with actual coverage. They exclude latest prices, current average-volume benchmarks and current macro snapshots. Stocks reject price rows from another session. Market news now uses ET session dates and marks after-close news.
- Stock and market generation reject missing/empty sections; Groq rejects token-budget truncation. The scheduled stock job and historical AI replay share `generateStorySections`.

## This replacement's authorship and evidence

The agent wrote 100 distinct explanations and business interpretations in `editorial-notes.txt`, reviewed against retained article summaries and peer/market prices, plus eight individually written sections for each market day in `market-editorial.json`. `compose-editorial.mts` attaches computed comparison/history context without calling a provider. This is an agent-authored editorial replacement, not a claim that Groq produced the persisted prose.

The dated record has no numerical fundamentals observation before the close of any of these five sessions. Business sections therefore analyze retained company news and price alignment/tension, with the earnings-comparison limitation stated. Current cache values were not projected backward. Twenty of 43 tracked stocks have closes for each day, so market sections explicitly disclose coverage. TXN's September 23 dividend article is explicitly after-close context, never a cause of the earlier gain.

## Persistence receipt

Written at `2026-09-27T04:54:54.666Z`: 100 stock stories and five market stories. Readback deep comparison verified all 100 + five sections objects against `authored-draft.json`. Prior rows are retained locally in `authored-draft.json.before.json`; readback in `.after.json`. Both are excluded from git.

## Checks

- Every market percentage matched the captured computed input values.
- 100 distinct explanations and 100 distinct business reads; no old fundamentals template; required Recent Trend fields confined to their designated sections.
- Full existing test suite: 184/184. TypeScript and targeted ESLint passed. Production generator imports work in the Node historical CLI.

- Production build passed from an isolated HEAD copy containing only the pipeline changes (`next build --webpack`), excluding pre-existing UI edits.

Deployment is checked against the pushed commit after publishing; the local receipt records the final SHA and production-page checks.
