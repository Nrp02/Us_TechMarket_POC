# 03: SEC 8-K filings as a Today's Story input

**What to build:** When a Top-20 company files a Form 8-K (a material-event disclosure) on the same day as its trading session, Today's Story's generated narrative can cite it — grounded only in the filing's own structured metadata (form type, date, SEC item codes), never in invented content about what the filing says. This is the one class of fact in the product that comes directly from the regulator rather than from paraphrased news coverage.

**Blocked by:** None (can start immediately) — touches the same prompt-assembly area as ticket 02, so landing after ticket 02 reduces merge-conflict risk, but there is no logical dependency; the causal-inference grounding rule this relies on already exists for the "explanation"/"peerSectorRelation" sections even before ticket 02 widens it.

**Status:** ready-for-agent

Full detail: [`../../sec-filings-signal/spec.md`](../../sec-filings-signal/spec.md)

- [ ] A new SEC EDGAR upstream client fetches a company's recent filings by CIK, with a descriptive `User-Agent` header per SEC's fair-access policy, no API key
- [ ] Top-20 ticker→CIK map hardcoded, sourced once from SEC's public mapping file
- [ ] A new append-only filings table exists, deduplicated on SEC's accession number, storing symbol/form/filing date/item codes/fetched-at
- [ ] Ingestion filters to `form === "8-K"` only at write time; no item-code filtering
- [ ] Fetching is folded into the existing market-hours-gated 15-minute refresh cycle, one call per Top-20 company (not the index ETFs)
- [ ] Backfill + ongoing retention capped to a rolling ~370-day window (not full filing history), with the same "never delete every remaining row" guard this project already applies elsewhere
- [ ] The day's matching filing(s), if any, are wired into Today's Story's existing structured prompt input — no new prompt section, no new AI call
- [ ] Live check: a known recent 8-K for a Top-20 symbol fetches and stores correctly
- [ ] Dedup confirmed: fetching twice does not duplicate a filing row
- [ ] A same-day filing for at least one symbol is confirmed cited in that symbol's generated narrative
- [ ] The project's build docs record the reversal of the prior "SEC filings: never built, and not owed" decision, with the reasoning for why this is different (structured fact into an existing narrative, not a document-browsing UI feature)
- [ ] `npx tsc --noEmit` and `npm run lint` clean
