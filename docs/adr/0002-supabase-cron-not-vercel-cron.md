# ADR 0002 — Schedule ingestion with Supabase Cron, not Vercel Cron

- **Status:** Accepted
- **Decided:** 2026-08-14 (`supabase/migrations/0004_enable_cron.sql`, commit `84f5e21`)
- **Recorded:** 2026-10-10

## Context

Ingestion must run every 15 minutes during market hours, plus news cycles and after-close jobs. The project is on Vercel's Hobby plan, which allows a cron job to run at most once per day; more frequent expressions fail at deploy time.

## Decision

Use Supabase Cron (`pg_cron` plus `pg_net`). Each job is a database schedule that POSTs to a route with a bearer secret read back from Supabase Vault at run time. Schedules are provisioned by an idempotent script (`scripts/setup-cron.mts`), not by a migration, because they need the deployed URL and secret that a migration should not hold. Retention runs as a pure SQL `pg_cron` job.

The market-hours check lives in the endpoint, evaluated in `America/New_York`. The UTC window only has to be wide enough to contain the session under both EST and EDT; a tighter expression would drift an hour at each changeover.

## Consequences

- No scheduler cost, and schedules live beside the data.
- A queued request is reported as success by `pg_cron`, so a run must be verified in `net._http_response`, not `cron.job_run_details` ([operations-runbook.md](../operations-runbook.md)).
- Changing a schedule means running the setup script against the shared database, so it is the owner's decision.
- Supabase pauses an idle free-tier project after about a week and cron stops with it; retention is written so a resume still finds data ([data-architecture.md](../data-architecture.md)).

## Alternatives considered

- **Vercel Cron:** rejected, once a day on Hobby.
- **GitHub Actions on a schedule:** workable, but timing is best-effort, and a second place to keep secrets. It is used only for the post-deploy cache warm.
