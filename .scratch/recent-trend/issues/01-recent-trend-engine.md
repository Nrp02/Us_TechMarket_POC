# 01 — Recent Trend engine

Status: resolved
Blocked by: none

Implement the pure `computeRecentTrend` engine from the spec and approved
research: trailing ten trading-day closes, strict two-day swing arms,
nullable insufficient-history result, net window change and confirmed
reversal age. Add the closing-price ADR and Recent Trend glossary entry.

## Acceptance

- Engine tests cover monotonic, V/inverted-V, flat, tied swing candidates,
  unsorted input without mutation, short history, window trimming and the
  two-trading-day confirmation boundary.
- Document the confirmation lag and named 1% fallback threshold.
- No DB, upstream client, schema or retention change.

## Comments

- ADR, glossary and specified edge-case tests are written.
- Implemented the owner's corrected same-kind swing pairs, single-swing
  latest leg, and no-swing net-change fallback. Conflicting/equal structure
  stays no-clear-trend. Multiple swings without both pairs also stay unclear.
- Engine plus assembler verification passed; full suite: 184/184. TypeScript
  and changed-file lint passed. No schema, upstream or retention changes.
