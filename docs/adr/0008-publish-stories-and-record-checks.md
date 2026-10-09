# ADR 0008 — Publish story drafts and record check failures; do not reject them

- **Status:** Accepted (owner decision)
- **Decided:** 2026-09-29 (commit `b36f0dd`), simplified 2026-10-05 (commit `715856c`)
- **Recorded:** 2026-10-10

## Context

The first design rejected any Today's Story or Market Story draft that failed a deterministic check and asked the model to correct it, recording attempts in a ledger table. Two problems followed: a prototype must have content every day, and rejections plus correction calls were burning the Groq quota (8,000 tokens a minute, 200,000 a day). A stock that kept failing also took slots from others.

## Decision

Publish every draft that has all required sections and a usable response. Checks run locally on the response and are stored in `sections.checks`:

- `shown`: a figure not in the supplied input, a flat or sign error, "no earnings released", a market-YTD comparison. Displayed under the card as **"Automated check: …"**.
- `logged`: trend wording or placement. Stored only.

A figure rounded from a supplied one (−2.98% → −3%) is not a violation. Only a missing section or an unusable response leaves a stock pending for a later run. Stocks rotate by five-minute slot so failures cannot starve others. There is no model-correction feedback and no attempt ledger (table dropped in migration 0022); checks cost no extra AI tokens.

For news, the equivalent is per-entry validation: an invented, duplicate or empty blurb is dropped and the rest of the batch stored (approved 2026-10-06).

The prompts still forbid inventing, calculating, predicting and advising. Only the enforcement changed, from blocking to recording.

## Consequences

- Every trading day has stories, and quota is spent only on generation.
- Faults can reach readers. Mitigation: the shown checks make known violations visible, and the limits are documented ([ai-architecture.md](../ai-architecture.md), README "Honest limits").
- Measured gap (2026-10-09, 80 stories): forward-looking wording and one reversed peer comparison were not caught. Adding validators for these is the natural next step; it would not need to block publication.
