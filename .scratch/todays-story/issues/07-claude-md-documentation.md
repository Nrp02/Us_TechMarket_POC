# 07: Record decisions in CLAUDE.md

**What to build:** CLAUDE.md accurately reflects the shipped feature — content contract, data sources, AI call budget, and the safety-rule policy change — so a future reader (or agent) doesn't have to reverse-engineer what changed and why from the diff alone.

**Blocked by:** 01, 02, 03, 04, 05, 06 (must describe what actually shipped, not what was planned).

**Status:** done.

- [x] The Phase 4 content contract lists the 7 stat cards (not 5) and describes the "Today's Story" section in place of the old single AI-summary card. Updated in place under "### Phase 4 — Today's Activity".
- [x] The Data Sources table's Peers row is corrected to point at the new hardcoded peer map instead of implying a live Finnhub peers call.
- [x] A new entry under "Decisions that were explicitly reversed" records the causation-clause policy change: what the original rule was, the false-causation case that justified locking it, exactly what changed, what stayed banned (self-calculation, prediction, investment advice), and why the tradeoff was accepted this time. Added as "Today's Story replaces the AI Daily Summary, and one AI Safety rule is deliberately loosened to make it worth having," cross-referenced from the AI Safety / Data Integrity Rules section and from the original "narrative is generated in three parts" entry it extends.
- [x] The AI call budget section records the Groq/Gemini split (which call uses which provider, each provider's measured free-tier limits, and the resulting daily call counts) rather than describing a single-provider budget. Also flags, as an explicit open operational issue rather than a silent inaccuracy, that the old Gemini `daily-summaries` cron job is still provisioned and now writes to a table nothing reads.
- [x] The page's display-name change is noted (reads "Today's Story" to visitors, still served at `/todays-activity/[symbol]`) so nobody "fixes" the apparent mismatch later. Noted in the Phase 4 content contract and in the "Decisions that were explicitly reversed" entry.
- [x] `npm test`, `npx tsc --noEmit`, and `npm run lint` are all clean on the final state. 125/125 tests pass, tsc clean, lint 0 errors (152 pre-existing warnings in unrelated files, none introduced by this work).
