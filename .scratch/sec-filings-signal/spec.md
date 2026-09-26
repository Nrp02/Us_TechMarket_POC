# SEC EDGAR 8-K filings as a Today's Story signal

## Problem Statement

Today's Story reasons about price, volume, peers, sector, fundamentals, and news — but never about the one class of fact a real analyst would check first when a stock moves unusually: whether the company itself filed anything material with regulators that day. Without it, "Why It Moved" and "What Happened" can only ever ground a claim in news coverage or in year-old quarterly fundamentals, even on a day where the company disclosed a material event (an acquisition, an executive departure, a new financing arrangement) directly to the SEC.

## Solution

Add a free, no-key-required SEC EDGAR data source that checks each Top-20 company for newly-filed Form 8-Ks (material-event disclosures) on the same cadence the app already refreshes price/volume data, stores them as an append-only event log, and feeds any filing found for a symbol's trading day into that symbol's Today's Story prompt as one more piece of structured, grounded input — never as a standalone display, and never with any AI-side judgment about which SEC item codes matter.

## User Stories

1. As a visitor reading "What Happened" or "Why It Moved", I want the narrative to reference a same-day material SEC filing when one exists, so I get a signal no other part of the page currently surfaces.
2. As a visitor, I want that reference grounded only in what the filing actually is (form type, filing date, the SEC's own item codes) — never in speculation about its contents — so the product's no-invented-facts rule holds for this input exactly like every other one.
3. As the project owner, I want only Form 8-K filings tracked (not the routine Form 4/144 insider-trading and restricted-sale notices that dominate most companies' real filing history), so the signal isn't drowned in noise a visitor would never care about.
4. As the project owner, I want every 8-K item code tracked with no hardcoded "which ones matter" allow-list, so the reasoning about relevance is made once, at read time, by the model looking at the day's full context — not baked into an ingestion-time filter that would need separate maintenance.
5. As the project owner, I want filing data fetched on the existing 15-minute market-hours-gated refresh cycle, not a separate schedule, so a filing is available to that day's Today's Story generation as soon as it's practical, using infrastructure that already exists.
6. As the project owner, I want the filings table to behave as an append-only event log (deduplicated by the SEC's own accession number), not a per-symbol cache that gets overwritten, so historical filings are never silently lost the way an upserted "current state" row would lose them.
7. As the project owner, I want filing history capped to a rolling ~1-year window (both on initial backfill and in ongoing retention), not pulled or kept in full, so old filings that Today's Story (which only ever looks at "today") will never consume don't grow the database indefinitely.
8. As the project owner, I want the ticker-to-CIK mapping needed to query SEC's per-company endpoint hardcoded for the Top 20 symbols (sourced once from SEC's own public mapping file), not fetched at runtime, so this doesn't become a second upstream dependency on the request/generation path.
9. As the project owner, I want this to cost zero additional AI-provider quota (Gemini or Groq) — the filing data is structured input into the existing single Today's Story call per stock, not a new call.
10. As the project owner, I want this recorded in the project's build docs as an explicit reversal of the prior "SEC filings: never built, and not owed" decision, with the reasoning for why it's now worth doing (a structured, free, low-noise signal feeding an existing narrative call) so a future reader doesn't mistake this for scope creep against a documented decision.

## Implementation Decisions

- **New upstream client**, mirroring the existing per-provider client modules (e.g. the Finnhub and Yahoo clients) in shape: fetches a company's recent SEC filings by CIK, using SEC's public per-company submissions endpoint. No API key required; SEC's fair-access policy requires a descriptive `User-Agent` header identifying the caller, which the client sets on every request.
- **Ticker→CIK mapping**: hardcoded for the Top 20 symbols, in the same style as the existing hardcoded peer map — sourced once from SEC's public ticker-to-CIK mapping file during implementation, not fetched live.
- **Filtering**: only rows where the filing's form type is exactly `8-K` are kept; every other form type returned by the endpoint (insider-trading notices, quarterly/annual reports, proxy statements, etc.) is discarded at ingestion. No filtering by the 8-K's own item codes — every item code is stored and passed through as-is.
- **New table**, structured as an append-only event log: one row per filing, keyed for deduplication by the filing's own SEC accession number (a globally unique identifier SEC assigns to every filing) rather than by symbol — this is the same shape as this project's existing per-article news storage, not the same shape as its existing per-symbol fundamentals cache. Fields: symbol, form type, filing date, item codes, accession number, fetched-at timestamp.
- **Ingestion cadence**: folded into the existing market-hours-gated 15-minute refresh cycle that already fetches price/volume/snapshots for the Top 20 — one additional per-symbol call on that same cadence, for companies only (not the index ETF proxies). A filing found on a given calendar day is available to that day's end-of-day Today's Story generation.
- **Retention**: rolling ~370-day window, matching the existing daily-closes retention pattern exactly — an initial backfill only pulls filings from within that window (not full filing history), and an ongoing pruning pass uses the same "never delete every remaining row" guard pattern this project already applies to its other retention-pruned tables, so a period of inactivity can't empty the table.
- **Today's Story integration**: the day's matching filing(s) for a symbol (if any) are added to the structured input the narrative prompt already assembles, alongside price, peers, sector, fundamentals, and news — available to be cited by any section, most naturally "What Happened" and "Why It Moved", under the same grounding rule the rest of the prompt now uses project-wide (state only what the data shows or a plausible connection the data supports; never invent, predict, or advise). No new prompt section is added solely for this — it's additional context for the existing sections to draw on.
- **No new AI-provider call**: this is additional structured input to the existing one-call-per-stock Today's Story generation; it does not touch the news-summarization pipeline or add a second Groq/Gemini call.
- **Build docs**: record the reversal of the prior "SEC filings: never built, and not owed" note, explaining the distinction that makes this different from the cut SEC Filings tab — this is one structured fact (form + item codes + date) feeding an existing narrative, not a document-browsing UI feature.

## Testing Decisions

- No automated test seam is added for the new SEC client or the ingestion write path — this mirrors the existing precedent in this codebase, where upstream API client modules (the Finnhub and Yahoo clients) have no test files, while only pure computation/classification modules (which take plain inputs and return a value or label with no network or database access) are covered by tests.
- Verification is manual: confirm live against the real SEC endpoint that a known recent 8-K for a Top-20 symbol is fetched and stored correctly (form type, item codes, accession number); confirm the dedup key prevents the same filing from being inserted twice across repeated refresh ticks; confirm a same-day filing actually reaches the Today's Story prompt's input and gets cited in the generated narrative for at least one symbol with a real recent 8-K.
- Type-check and lint clean, as usual.

## Out of Scope

- Any filtering or classification of 8-K item codes by importance — every item code is passed through unfiltered; the model does the judgment at generation time, not ingestion.
- Tracking any SEC form type other than 8-K (no 10-Q/10-K/insider-trading tracking).
- A standalone UI element (list, card, or tab) displaying filings independent of the Today's Story narrative — this data only ever reaches the page through the AI narrative's grounding, never as its own display surface.
- Reopening the cut "SEC Filings" tab from earlier phases — that was a document-browsing feature; this is a structured data point, and the two remain separate decisions.
- Fetching or storing full filing document text/content — only the structured metadata (form, date, item codes, accession number) is stored, never the filing body.

## Further Notes

- SEC EDGAR's per-company submissions endpoint and ticker mapping file were both verified live during planning: no API key required, real structured data returned (including 8-K item codes) for a live symbol test. A real company's filing history was also checked and found to be dominated by routine Form 4/144 filings (hundreds) against a much smaller number of 8-Ks — confirming the form-type filter is necessary and sufficient noise control.
- This spec's decisions came out of a grilling session (Thai-language) with the project owner; every implementation decision above (form-type-only filtering with no item-code allow-list, prompt-input rather than standalone-display integration, existing-cadence ingestion, event-log rather than cache table shape, ~370-day rolling retention) was explicitly settled, not assumed — including one revision mid-session (retention was initially proposed as unbounded and was corrected by the owner to the rolling window described above).
- This is expected to be a low-frequency signal in practice — most companies file an 8-K only occasionally, so most symbols on most days will have nothing new to surface. The value is in the rare cases where a same-day filing exists, not in constant coverage.
