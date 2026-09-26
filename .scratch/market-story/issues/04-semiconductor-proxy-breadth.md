# 04: Semiconductor sector proxy (SOXX) + breadth computation

**What to build:** A visitor on the Market page can see, in numbers, whether today's tape was broad or narrow, and how the semiconductor sub-sector is doing relative to the rest of tech. `SOXX` is added to ingestion as a semiconductor ETF proxy (same mechanism as the existing `XLK`). A new pure computation counts how many of the Top 20 advanced vs. declined today, and how many cleared the existing Significant Movement rule — both surfaced visibly on the Market page (not only provable via a test).

**Blocked by:** 03

**Status:** ready-for-agent

Full detail: [`../spec.md`](../spec.md) — see "Sub-sector market proxy" and "Breadth" under Implementation Decisions.

- [ ] `SOXX` is ingested every cycle alongside the existing index proxies, with no new page ever calling it directly (ingestion-only, per the existing rule)
- [ ] A new pure function computes advancers/decliners and a Significant-Movement count across the Top 20, reusing the existing shared significance rule (no new formula)
- [ ] Both the semiconductor proxy reading and the breadth counts are visibly rendered on the Market page today, ahead of the narrative (ticket 07) that will later consume them
- [ ] Sector-level averages (the 6-bucket map from ticket 01) are computed from the Top 20's own data with no additional upstream call
