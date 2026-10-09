# ADR 0007 — Split AI work across three providers, each budgeted against its own quota

- **Status:** Accepted (evolved)
- **Decided:** Gemini 2026-08-14 (`gemini.ts`); Groq 2026-09-26 (`groq.ts`, commit `7f51d3a`); OpenRouter 2026-09-27 (`openrouter.ts`, commit `e450eba`)
- **Recorded:** 2026-10-10

## Context

The build is free-tier only, and every AI provider has a different binding limit, discovered by measurement rather than documentation:

| Provider | Binding limit |
|---|---|
| Gemini `gemini-3.5-flash` | 20 requests per day per project (read from a live 429) |
| Groq `gpt-oss-120b` | 8,000 tokens per minute; 200,000 per day |
| OpenRouter free model | 50 requests per day, 20 per minute |

At one stage Gemini ran news summarisation and daily summaries together at 14–16 calls a day, one debugging session from a demo with no summaries.

## Decision

Give each provider the job whose shape fits its limit, so no job trades headroom with another:

- **OpenRouter** writes news blurbs: one call per cycle, 12 cycles a day, up to 50 articles each.
- **Gemini** writes the plain AI Daily Summary: batches of five stocks, 4 calls a day.
- **Groq** writes Today's Story (one call per stock) and Market Story (one per day), about 21 calls a day. A per-minute token cap does not care how many requests it takes, and a call per stock also avoids the multi-stock JSON-truncation failure seen twice with Gemini batches.

Rules that apply to all: batched or one-per-stock only; never per article or per visitor; no immediate retry (a 429 defers to the next scheduled run); two Gemini keys from two Google projects (deployed and test) because quota is per project.

## Consequences

- Daily budget is the sum of independent ceilings: about 12 + 4 + 21 calls, each far under its own limit.
- Three clients, three failure modes and three sets of keys to manage.
- The model choices are pinned (`gemini-3.5-flash` because 2.5 Flash returns 404 for new keys; the OpenRouter model because capacity varies by model).
- Reversed along the way, recorded in `history/reversed-decisions.md`: Gemini originally wrote the news summaries and the Today's Activity summary was briefly retired in favour of Today's Story, then reinstated as its own card on 2026-09-26.
