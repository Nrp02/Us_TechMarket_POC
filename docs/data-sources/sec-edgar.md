# SEC EDGAR

**Role:** Form 8-K metadata (material-event disclosures) for the Top 20, used as input to Today's Story. Client: `src/lib/sec-edgar.ts`. Free, no API key.

## Endpoint

`https://data.sec.gov/submissions/CIK##########.json` per company. The ticker-to-CIK mapping is a hardcoded `CIK_BY_SYMBOL` in `src/lib/symbols.ts`, sourced once from SEC's public `company_tickers.json`. The client follows the submissions endpoint's older `files` array for companies whose recent filings spill over.

## What is stored

`sec_filings` is an append-only log (migration 0013) of `form` and `item_codes` (for example `2.02,9.01`) with the filing date. **Metadata only**: no filing text is fetched or summarised. Story generation reads the stock's filings dated today.

## Compliance

SEC's fair-access policy requires a descriptive `User-Agent` identifying the requester; the client sets one. Requests run on the 15-minute refresh cycle for 20 companies, well under the published request ceiling.

## Why it was added

The original plan cut an SEC Filings tab and recorded SEC as "never built, and not owed". That was reversed for a different reason: not a page of filings, but a dated fact that can ground an explanation in Today's Story (an 8-K filed that day is evidence the model may cite). The decision is recorded in `history/reversed-decisions.md`.

## Failure behaviour

A failed fetch leaves the previous rows; the story is generated without a filings list. An empty list means "no 8-K filed today", which the prompt must not turn into claims about earnings.
