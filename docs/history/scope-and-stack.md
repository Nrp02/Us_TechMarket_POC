> Moved verbatim from CLAUDE.md on 2026-09-29 (commit 1dbde83). History and reasoning, not a summary of current behaviour: where this and the code disagree, the code wins.

## What you are building

### Current scope (2026-09-26) — supersedes historic scope/budget notes

- News and market breadth/movers/sector averages: 43 `TRACKED_STOCK_SYMBOLS`.
  Refresh: 43 stocks plus six ETF proxies. Deep single-stock analysis,
  fundamentals, SEC and peers: Top 20 only. `ALL_SYMBOLS` stays Top 20 plus ETFs.
- News filters: All plus six sectors. Extended stocks have names and relevance
  aliases; ambiguous tickers AI/F/ON/TEAM are not ordinary-word matches.
  Extended logos may use the existing ticker fallback.
- News blurbs: free OpenRouter, pinned `dots-studio/dots-3-note-preview:free`.
  The owner approved non-Qwen free models, prioritising volume. Dots passed
  50 fictional mixed-topic articles through the production client in 20.6s.
  Reasoning is disabled; strict JSON schema plus complete-batch validation.
  No paid/model fallback or immediate retry. Provider shared capacity can
  still return 429 independently of the account quota.
  On 2026-09-26, `/api/v1/key` reported 50 free requests/day for this account;
  the documented limit is 20 requests/minute. Daily quota is account-wide,
  not multiplied by changing models. Only 12 scheduled requests/day proposed.
  Gemini is reserved for AI Daily Summary (four successful batches/day,
  up to 12 existing scheduled attempts). Groq continues both Story jobs.
- Proposed news cron: `7 0,2,4,6,8,10,12,14,16,18,20,21 * * *` UTC,
  12 cycles/day, offset from refresh
  and EOD jobs. The 21:07 cycle is after the close under EST/EDT and before
  Daily Summary starts at 22:05. One AI attempt/cycle, maximum 50 articles:
  theoretical ceiling 600 blurbs/day, not guaranteed throughput or coverage.
  Live cron is unchanged.
  Concurrency five bounds workers, not requests/minute. Warm refresh uses 49
  quotes; cold fundamentals can still hit the minute quota and defer work.
- Store fetched articles before AI. Validate a complete batch before persisting
  blurbs. Pending blurbs are best-effort while articles remain in the fetched
  window; this is not a durable DB-backed queue. Report `aiCalls` and failures.
- Significance count is Top-20-only, labelled in UI and Market Story prompt.
  Snapshot and day-news reads paginate beyond the 1,000-row PostgREST ceiling.
- Preparation only: provider smoke tests and pure/local verification, no live
  ingestion, cron provisioning or deployment. Local jobs share production DB.

An AI daily intelligence app for tracking US Technology stocks. Core question the product answers, per stock, once a day: **"What happened to this stock today?"**

Workflow: Watch → Collect → Filter → Understand → Summarize.

Constraints that shape every decision below: no user accounts, no budget (free tiers only), optimized for a working, presentable, deployable link — not scale, not robustness.

## Stack

- **Frontend + Backend**: Next.js (App Router), one repo
- **Database**: Supabase (Postgres, free tier)
- **Scheduled jobs**: Supabase Cron (`pg_cron` + `pg_net`) — **not** Vercel Cron; see the reversal note below for why
- **Hosting**: Vercel (free tier)
- **AI**: Gemini API, model **`gemini-3.5-flash`** (Gemini 2.5 Flash is unavailable — see the reversal note below), free tier only — no billing enabled on the Google AI Studio project, ever. See "Free tier verification" under Open Items — don't trust a specific rate-limit number from training data or a blog post; check the live console at build time.

## Division of labor: this file vs. DESIGN.md

**Reversed by the owner.** Visual design used to be assigned to a separate "Claude Design" pass, with this file forbidden from saying anything about how things look. That split is gone: whoever builds the page also owns layout composition, colour, spacing, typography, theme, and hierarchy, and does not wait on an external visual reference.

The division that remains is between two files, and it is worth keeping:

- **This file is the content contract** — what data and functionality must exist on each page, and what was explicitly cut. Every content decision here went through several rounds of scoping with the owner, so if a visual pass adds or drops a *field, section, or feature* on its own, this file wins and the visual is re-derived from the checklist.
- **`DESIGN.md` is the visual contract** — tokens, type ramp, form language, component character, and the named rules. It is generated from the built code by `/impeccable document`, so it describes what exists rather than what was hoped for. `PRODUCT.md` holds durable product truth alongside it.

The content contract does **not** constrain composition. "Five cards", "eight columns exactly" and the like fix what must be *present and legible*; they do not fix the arrangement, the scale, the density, or the visual weight of any of it. A pass that changes how the page is composed while keeping every required field is working as intended.

## Language & Technology Policy

Programming language is NOT locked.

Claude Code may choose TypeScript, Python, SQL, or another appropriate
language when it provides a meaningful technical advantage.

Language selection must be based on:
- compatibility with the existing architecture
- deployment constraints
- free-tier availability
- maintainability
- reliability
- performance
- library/API support
- implementation complexity

Do not introduce a second language unless the benefit is significant enough
to justify the additional runtime, deployment, dependency, and maintenance cost.

The architecture and product requirements are locked; the implementation
language is not.

