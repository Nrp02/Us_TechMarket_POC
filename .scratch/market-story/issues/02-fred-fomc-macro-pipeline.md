# 02: FRED + FOMC macro data pipeline

**What to build:** A scheduled, server-side ingestion path (never client-triggered, per the project's existing ingestion rule) that pulls today's relevant US macro data — CPI, unemployment, and GDP release-level readings from FRED, plus a check against a hardcoded FOMC meeting calendar and the fed-funds-rate series to know whether today was a rate-decision day. Stored for later consumption by Market Story; this ticket does not yet wire it into any narrative or UI.

**Blocked by:** None (can start immediately, independent of ticket 01)

**Status:** ready-for-agent

Full detail: [`../spec.md`](../spec.md) — see "Macro data (Market Story input)" under Implementation Decisions, and the FRED/FOMC sourcing rationale under Further Notes.

- [ ] A new isolated upstream client for FRED exists and is reachable only from a scheduled ingestion job (mirrors the existing `finnhub.ts`/`yahoo.ts` isolation, enforced by the existing `no-restricted-imports` rule)
- [ ] A hardcoded FOMC meeting-date calendar exists (one-time manual entry, same posture as the existing peers/CIK/sector maps)
- [ ] Each ingestion run stores that day's macro reading(s) (CPI/unemployment/GDP release data, and whether today was an FOMC decision day plus the outcome) with no invented values — a day with nothing released stores nothing rather than a guess
- [ ] Storage follows the same 7-day retention with the never-empty-the-table guard already used by every other pruned table
- [ ] Verified live: a manual trigger of the ingestion job produces a real stored row, checked against FRED's actual published data for that day
