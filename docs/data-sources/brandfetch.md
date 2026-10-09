# Brandfetch (company logos)

**Role:** company logos. `src/lib/logos.ts` emits `cdn.brandfetch.io` URLs that the **browser** loads on page views. This is the single deliberate exception to "every upstream call comes from a scheduled job".

## Why the exception is safe

The ingestion rule protects metered quotas. Finnhub allows 60 calls a minute and Gemini 20 requests a day, so page traffic reaching either would starve the jobs with no way to buy more. Brandfetch's Logo CDN is a free static-asset host with a 500,000 requests/month allowance, returns images rather than data, and cannot exhaust anything the app depends on. The exception must not be generalised to anything that returns data.

## Licence (read and recorded)

- Caching is licensed for **30 days only**.
- The underlying marks remain third-party IP with no redistribution right.
- The Logo API is free to 500k requests/month with no attribution required.
- The fair-use guide names educational projects and stock apps identifying brands as acceptable.

Consequence: logos are **hotlinked and never vendored**. An earlier design had planned to vendor them; the licence ruled it out.

## Behaviour

- Every Top-20 and tracked stock has a mark or a ticker fallback; `logos.test.ts` fails if a stock is added without one.
- Brandfetch refuses curl and headless user agents, so logo rendering must be verified in a real browser.

## Tooling

A Brandfetch MCP server exists for lookups during development. It was initially misconfigured as `"type": "sse"` against a Streamable HTTP endpoint; `"type": "http"` fixed it (`history/resolved-and-open-items.md`). It is a developer aid and has no role at runtime.

## Failure behaviour

If the CDN is unavailable the image fails to load and the ticker badge shows; no data on the page depends on it.
