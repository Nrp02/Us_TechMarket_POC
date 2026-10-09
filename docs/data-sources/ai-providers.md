# AI providers

Three providers, three jobs, three independent free-tier quotas ([ADR 0007](../adr/0007-three-ai-providers-by-quota.md)). Clients are in `src/lib`; only scheduled jobs import them. Behaviour and safety rules are in [../ai-architecture.md](../ai-architecture.md); this page records what each provider constrains.

## OpenRouter — news blurbs

| | |
|---|---|
| Client | `openrouter.ts` (`generateNewsJson`) |
| Model | `dots-studio/dots-3-note-preview:free`, pinned |
| Limits | 50 free requests/day for the account (read from `/api/v1/key`); documented 20/minute; the daily quota is account-wide and not multiplied by changing models |
| Call shape | One call per cycle, ≤ 50 articles, `temperature: 0`, reasoning disabled, strict `json_schema` |
| Fallback | None. No paid or alternative model, no immediate retry |
| Throughput | 12 cycles a day → at most 600 blurbs; not a coverage guarantee |

The owner approved a non-Qwen free model to prioritise volume. In a test, the model returned 50 fictional mixed-topic articles through the production client in 20.6 s. Shared provider capacity can return 429 independently of the account quota.

## Gemini — AI Daily Summary

| | |
|---|---|
| Client | `gemini.ts` (also exports `SAFETY_RULES`) |
| Model | `gemini-3.5-flash` (`GEMINI_MODEL`); 2.5 Flash returns 404 for new keys |
| Limit | **20 requests per day per project per model** — read from a live 429 (`GenerateRequestsPerDayPerProjectPerModel-FreeTier`, `quotaValue: 20`), not from docs |
| Call shape | Batches of 5 stocks, 4 successful calls cover the Top 20; up to 12 scheduled attempts absorb 503s |
| Settings | `temperature: 0`, response schema |

Two keys from two Google projects exist, one for the deployed site and one for tests, because quota is per project. That the projects are separate was measured: the deploy key returned 429 while the test key succeeded on the next request. Billing must never be enabled.

## Groq — Today's Story and Market Story

| | |
|---|---|
| Client | `groq.ts`, `story-analysis-call.ts` |
| Model | `openai/gpt-oss-120b` (`STORY_ANALYSIS_MODEL`); `GROQ_MODEL` defaults to `gpt-oss-20b` for other uses |
| Limits | 8,000 tokens/minute (binding), 200,000 tokens/day for the 120b model |
| Call shape | One call per stock; `reasoning_effort: medium`, `max_completion_tokens: 4500`, 30 s timeout, `temperature: 0` |
| Failure | Typed failures; a 429 skips that stock and a later slot retries it |

A per-minute token cap does not care how many requests it took to spend it, which is why stories are one call per stock rather than a multi-stock batch; per-stock calls also remove the multi-stock JSON-truncation failure seen twice with Gemini batches.

## Shared rules

- Never call per article, per visitor or per interaction.
- A 429 or 503 costs the cycle; it is not retried immediately.
- Every failed attempt and every manual trigger still spends a request, so manual runs use the test keys ([../operations-runbook.md](../operations-runbook.md)).
