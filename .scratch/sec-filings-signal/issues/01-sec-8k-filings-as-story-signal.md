# 01 — SEC EDGAR 8-K filings as a Today's Story signal

Status: wontfix — superseded by [`todays-story-followups`](../../todays-story-followups/issues/03-sec-8k-filings-story-input.md) ticket 03 (same scope, renumbered into the consolidated dependency-ordered set from `/to-tickets`). This spec is still the detailed reference; only this ticket file is superseded.

Spec: [`../spec.md`](../spec.md)

## Summary

1. Add a new SEC EDGAR upstream client (per-company submissions endpoint, `User-Agent` header set per SEC's fair-access policy), mirroring the shape of this project's existing upstream API client modules.
2. Hardcode a Top-20 ticker→CIK map (sourced once from SEC's public ticker mapping file), same pattern as the existing hardcoded peer map.
3. Add a new append-only table for filings, deduplicated on the SEC accession number, storing symbol/form/filing date/item codes/fetched-at. Filter to `form === "8-K"` only at ingestion; no item-code filtering.
4. Fold fetching into the existing market-hours-gated 15-minute refresh cycle, one call per Top-20 company (not the index ETFs).
5. Backfill + retain on a rolling ~370-day window, mirroring the existing daily-closes retention pattern (including the "never delete every remaining row" guard).
6. Wire the day's matching filing(s) for a symbol into Today's Story's existing structured prompt input — no new prompt section, no new AI call; available for any section (most naturally "What Happened"/"Why It Moved") to cite under the same project-wide grounding rule.
7. Record the reversal of the prior "SEC filings: never built, and not owed" decision in the project's build docs, with the reasoning for why this is different (structured fact into an existing narrative, not a document-browsing UI feature).

## Verification checklist

- [ ] `npx tsc --noEmit` clean
- [ ] `npm run lint` clean
- [ ] Live check: a known recent 8-K for a Top-20 symbol fetches and stores correctly (form, item codes, accession number)
- [ ] Dedup confirmed: running the fetch twice does not duplicate a filing row
- [ ] A same-day filing for at least one symbol reaches the Today's Story prompt input and is cited in that symbol's generated narrative
- [ ] Retention/backfill window confirmed at ~370 days, not full history

## Comments
