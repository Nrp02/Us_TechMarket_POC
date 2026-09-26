# 02 — Today's Story: Recent Trend in Unusual vs. History

Status: resolved
Blocked by: 01

Wire the engine into the existing stock input assembler, structured prompt
and analysis guideline. Deep analysis remains Top 20.

## Acceptance

- Ten-day input includes today's stored close; short/empty history stays
  unavailable while existing volatility data remains usable.
- Keep `NO_UNUSUALNESS` and its percentile/range fallback condition.
- Trend reasoning appears only in Unusual vs. History, uses supplied
  numbers and confirmed reversals, and never predicts.
- Verify the assembler tests and a real generation with the Groq test key.

## Comments

- Implementation complete: engine wiring, prompt, guideline and assembler
  cases. Added an authoritative precomputed sign-comparison label after a
  live NVDA run conflated downtrend with positive net window change.
- Full suite 184/184, TypeScript and changed-file lint passed.
- Final live verification with `GROQ_API_TEST-KEY` passed for the actual
  September 25 session: NVDA downtrend, net +6.69%, reversal age 3 trading
  days, today's +0.22% against trend. Recent Trend appeared only in
  unusualness, without predictions. No database writes; news/fundamentals
  omitted from this numeric smoke sample. This is sampled verification,
  not a guarantee of all future model outputs.
