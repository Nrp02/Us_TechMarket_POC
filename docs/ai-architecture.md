# AI architecture

The product answers **"what happened"**, never "what happens next". AI is used for wording and interpretation of figures that code has already computed, in four places.

## Providers and jobs

| Job | Provider / model | Shape | Free-tier limit | Stored in |
|---|---|---|---|---|
| News blurbs | OpenRouter `dots-studio/dots-3-note-preview:free` | One call per cycle, ≤ 50 articles, strict JSON schema, reasoning off | 50 requests/day, 20/min | `news_summaries` |
| AI Daily Summary ("What Happened Today") | Gemini `gemini-3.5-flash` | Batches of 5 stocks → 4 calls/day | **20 requests/day per project** | `daily_summaries` |
| Today's Story | Groq `openai/gpt-oss-120b` | One call per Top-20 stock, `reasoning_effort: medium`, 4,500 completion tokens max | 8,000 tokens/min, 200,000/day | `stories` |
| Market Story | Groq `openai/gpt-oss-120b` | One call per day | same | `market_stories` |

The Home page makes **zero** AI calls. Why three providers: their quotas are independent, so no job trades headroom with another ([ADR 0007](adr/0007-three-ai-providers-by-quota.md)). Gemini 2.5 Flash returns 404 for new keys, so the model is pinned to `gemini-3.5-flash`.

### Call discipline
- Batched or one-per-stock only. Never per article, never per visitor, never per interaction.
- AI output is generated once per cycle and stored; two visitors cause zero AI calls between them.
- No immediate retries. A 429 or 503 defers to the next scheduled run (`retries: 0` on the Gemini call in `daily-summary.ts`; Groq skip-and-defer in `story-generation.ts`).
- Daily budget: about 12 OpenRouter + 4 Gemini + 21 Groq calls, each against its own ceiling (`history/ai-call-budget.md`).

## Safety rules

The AI must never: invent news, events, timestamps or numbers; calculate new numbers; predict prices or trends; give investment advice; or claim news caused a move unless the source says so.

Two refinements, both deliberate:
1. **Today's Story and Market Story may use grounded inference**, because a story that never connects a move to evidence is not worth reading. Every claim must point to a figure or label in the structured input, and no outside fact may be introduced. News blurbs keep the strict rule.
2. **A positive change narrated as a decline (or the reverse) counts as an invented number.** Where evidence does not explain a move, a fixed fallback line is used instead of a guess.

Prompts contain only good example sentences, because a quoted bad example gets copied.

## Today's Story: input, prompt, output

**Input** (`story-input.ts`) is one structured object: price and relative volume, significance, peers with each peer's move, sector and market gaps, the engine label, volatility percentile and range position, recent trend, YTD/MTD, fundamentals, the day's news with source excerpts, prior business context, SEC 8-K filings, and the 10-year yield. News is capped to the six highest-scoring articles (`selectStockNews`), which favours articles naming the symbol, company events (earnings, deals, launches) and pre-close timing, and penalises roundups and "stocks to buy" pieces.

**Prompt** is rendered by `story-analysis-quality.ts` from `story-guideline.ts`, which sets definitions (backdrop, residual, ahead/behind, engine label, range position, timing) and a four-step method: backdrop before residual; an explanation needs a dated source or a clear group pattern; weigh the strongest competing reading; business facts persist between releases.

**Output** is eight sections (`story-sections.ts`): `headline`, `comparison`, `classification`, `unusualness`, `explanation`, `fundamentals`, `peerSectorRelation`, `ytdTakeaway`, plus `checks`. Market Story has its own eight: `overallRead`, `breadth`, `macroContext`, `marketEvents`, `standoutMovers`, `sectorLeadership`, `volatilityContext`, `closingSynthesis`.

## Checks: record, don't block

Checks run locally on the response (no extra AI tokens) and are stored in `sections.checks`:

| Bucket | What it holds | Shown? |
|---|---|---|
| `shown` | A figure not in the input, a flat/sign error, "no earnings released", a market-YTD comparison | Yes, as "Automated check: …" under the card |
| `logged` | Trend wording or placement | Stored only |

A figure rounded from a supplied one (−2.98% → −3%) is not a violation. Only a missing section or an unusable response leaves a stock pending for a later run ([ADR 0008](adr/0008-publish-stories-and-record-checks.md)). News blurbs are validated per entry: an invented, duplicate or empty entry is dropped and the rest stored.

### Known limits (measured 2026-10-09)
A review of 80 stories (5–8 October) found the checks are narrower than the prompt rules:
- about one story in seven contained forward-looking wording the prompt forbids but no check catches;
- a peer-average comparison was written with the wrong direction once, uncaught;
- explanations ended "remains unresolved" in 78 of 80, a prompt-shape effect;
- the engine label compared only with SPY, so group moves were called company-specific — since fixed ([ADR 0010](adr/0010-sector-wide-engine-label.md)).

Not yet changed: the story job starts at 20:00 UTC, before some post-close explanatory news is published, and Market Story reads only general (no-ticker) news.

## Scheduling and fairness

Stories are generated one stock per five-minute slot (`0-55/5 20-23 * * 1-5`, 48 ticks for 20 stocks), starting from a rotating symbol so a persistent failure cannot starve others. The spare ticks absorb rate-limited or failed stocks.

## Keys

Two Gemini keys from two Google projects exist (quota is per project): one deployed, one for tests. `.env.local` holds the deploy key by default; swap the test key in before manual Gemini runs and run Groq tests through `.scratch/narrative-audit/with-test-key.sh`. Local and production share one database, so a local job run writes production rows ([operations-runbook.md](operations-runbook.md)). Keys are never committed.
