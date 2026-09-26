# 01: Fix fundamentals ingestion bug

**What to build:** The `fundamentals` table actually contains real data for all 20 tracked symbols, populated by a one-time backfill script that doesn't depend on market hours being open — so a Friday-evening deploy followed by a weekend never again leaves the table silently empty. The existing 7-day staleness re-fetch inside the market-data refresh job stays as a passive safety net.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

Full detail: [`../../todays-story-reasoning/spec.md`](../../todays-story-reasoning/spec.md) (the "Fundamentals bug — root cause and fix" implementation decision)

- [ ] Root cause confirmed live before fixing: `fundamentals` has 0 rows, traced to the fetch being folded into the market-hours-gated refresh job with no independent trigger
- [ ] A new one-time backfill script exists, mirroring the shape of this project's existing daily-closes backfill script (concurrency-limited, human-triggered, calls the upstream API directly, no scheduler secret involved), covering all Top-20 symbols
- [ ] An npm script entry exists to run it
- [ ] The refresh job's existing staleness re-fetch logic is left untouched
- [ ] Backfill run once against production; `fundamentals` has rows for all 20 symbols
- [ ] `npx tsc --noEmit` and `npm run lint` clean
