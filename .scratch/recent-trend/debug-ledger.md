# Debug ledger

1. Engine/assembler run: 31/32 passed. The erased-leg fixture expected
   one trough and reversal age 5, but the result had null reversal age.
2. Tried Node's debugger; it could not attach (port 9229 timeout). Traced
   strict neighbor checks and swing-count branches directly instead.
3. Ranked candidates: an extra confirmed peak in the fixture; a swing-age
   off-by-one; a strict-comparison defect. Enumerating the original prices
   independently found trough 4 AND peak 7, disproving the one-swing premise.
4. Differential: changed only close 8 from 102 to 108. The peak moved to an
   unconfirmable day, leaving trough 4 and a zero-net current leg. Result:
   no-clear-trend with age 5. No engine change was needed; corrected fixture.

5. End-to-end Market history reproduction: the original `.in(...).lte(...)`
   query returned exactly 1000 rows: DIA 251, QQQ 251, SOXX 251, SPY 247,
   no VIXY/XLK; SPY stopped on September 21. Hypotheses: absent stored data,
   symbol filter mismatch, or row-cap truncation. The existing chart reader
   and direct complete history disproved absent data/filter mismatch.
6. Owner approved pagination as an exception to the zero-extra-DB-read rule.
   Reused `getIndexDailyCloses` already used by the charts, backed by
   `readAllRows` with count verification and deterministic ordering.
   Regression fixture reproduces missing VIXY with 1000 rows, then verifies
   both VIXY/XLK trend and volatility after reading all pages.
7. Live market smoke initially described null reversal age as "no confirmed
   reversal" and no-clear-trend as "neutral trend." Tightened the actual
   prompts: null is unavailable age, not proof no swings occurred; unclear
   structure does not assert flat prices. The smoke harness now uses the
   production snapshot-based session resolver, avoiding weekend labels.

8. Correct-day NVDA smoke: downtrend, +6.69% net over the window, reversal
   age 3 trading days, today +0.22%. Despite local prompt guardrails, the
   model twice called the gain a continuation of an upward swing. Another
   run correctly called it a move against the downtrend. This falsifies
   the assumption that direction/net-change prose rules alone are reliable.
9. Added a precomputed today-vs-direction label in the prompt (no engine
   contract change). The next run correctly said the move was against the
   downtrend, but omitted the required net/age and leaked trend into another
   section. Added a global end-of-prompt rule requiring those fields and
   restricting their section, keeping magnitude unusualness distinct.
10. Market verification hit Groq 429; no immediate retry. Subsequent checks
    are paced separately from the stock calls. Production skip/defer is unchanged.
11. New dedicated test key succeeded for both final prompts. Stock included
    downtrend/+6.69%/3 trading days and confined trend to unusualness, but
    added a contradictory "not unusual in direction" summary. Market included
    unclear/-5.03%/unavailable age in the correct section, but called its move
    "against" an unclear trend. Added narrow prohibitions on these redundant
    directional verdicts; no engine, schema or client configuration changed.
12. Stock rerun passed feature checks: downtrend, +6.69%, 3 trading days,
    against-trend, only unusualness. Market rerun correctly refused a
    directional comparison for unclear VIXY (-5.03%), but closingSynthesis
    indirectly summarized "absence of a clear volatility trend". Added
    this exact leak as a prohibited example, preserving the section's own
    instruction and allowing only today's VIXY change/percentile there.
13. Market repeated the indirect closingSynthesis leak despite the explicit
    pre-input prohibition. That disproved sufficiency of this guard's
    placement. Added a final post-input JSON self-check targeting only
    closingSynthesis, with concrete forbidden wording. No postprocessing or
    deterministic replacement of model prose was introduced.
14. The harness's unavailable-input assertion assumed Input JSON was the
    prompt suffix. The post-input check invalidated that assumption; parsing
    failed before any Groq call. Bounded this manual parse at the new final
    check marker. Production JSON generation was not involved in the error.
15. Post-input closing check stopped the leak, but the model again inferred
    VIXY downtrend from negative net change. Extended the same final check
    to require faithful supplied direction and forbid directional comparison
    when no-clear-trend. This is the same direction/net conflation as run 8,
    not an engine defect.
16. Final market sample passed feature checks: VIXY no-clear-trend, -5.03%,
    no available directional comparison/confirmed age, confined to
    volatilityContext. closingSynthesis used today's decline only. Recorded
    4817 total tokens. Stock's final passing sample used 3607 total tokens.
    Both used the dedicated process-only test key and made no DB writes.
