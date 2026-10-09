# Security and compliance

This is a no-accounts, read-only public site with a handful of protected job endpoints. The threat model is small; the controls below are the ones that matter for it.

## Secrets

| Secret | Held in | Notes |
|---|---|---|
| `SUPABASE_SECRET_KEY` | Vercel env, `.env.local` | Bypasses RLS. Server-only, never `NEXT_PUBLIC_*` |
| `CRON_SECRET` | Vercel env, GitHub secret, Supabase Vault | Guards the job routes |
| Finnhub, Gemini, OpenRouter, Groq, FRED keys | Vercel env, `.env.local` | Only job modules import the clients |
| Database password | `.env.local` (`DATABASE_URL`) | Local tooling only; the deployed app does not need it |

`.env.local` is gitignored; `.env.example` lists names only. Every variable on the Vercel project is marked Sensitive, so values cannot be read back (`vercel env pull` yields placeholders). Keys are never written into tracked files.

## Access control

- **Row-level security is on for every table with no policies.** The publishable (anon) key has zero access; all reads and writes use the secret key from a route handler or server component (`src/lib/supabase.ts`).
- **Job routes fail closed.** Unset `CRON_SECRET` gives 503, a wrong token 401 ([api-contracts.md](api-contracts.md)). The scheduler reads the secret from Supabase Vault at call time.
- **No client-triggered upstream calls.** A page cannot cause a Finnhub, Yahoo, SEC or AI request, so a visitor cannot spend a quota or probe an upstream. Lint enforces it ([ADR 0003](adr/0003-pages-read-the-database-only.md)).
- **No user input reaches the database.** The only visitor inputs are query parameters (date, tab, sector) that select among stored rows; there are no forms, accounts or uploads.
- **Source text stays server-side.** `news_evidence` holds article source text for analysis and is never served as UI copy.

## Third-party terms

| Upstream | Constraint | Handling |
|---|---|---|
| Brandfetch logos | Caching licensed for 30 days only; marks remain third-party IP; free to 500k requests/month; educational and stock-identification use named acceptable | **Hotlinked, never vendored** (`logos.ts`). Tickers without a mark fall back to a ticker badge |
| SEC EDGAR | Fair-access policy requires a descriptive `User-Agent` | Set in `sec-edgar.ts`; metadata only |
| Yahoo chart endpoint | Unofficial | Used for one gap (volume, intraday bars, close); failure is "unknown" |
| Free API tiers | Quotas | Never exceeded by design; no billing enabled on any AI project |

Logos were accepted as real marks specifically because this is a demonstration without commercial deployment (`history/reversed-decisions.md`).

## Not financial advice

The product describes what happened to prices and news. It does not predict, recommend, rate or advise, and the README states plainly that there are no users, no track record and no financial-services standing. The AI prompts forbid advice and forward-looking claims; checks catch some violations but not all, and the gap is documented ([ai-architecture.md](ai-architecture.md)).

## Data protection

No personal data is collected or stored. There are no cookies of its own (the per-browser watchlist cookie was removed with the watchlist). Vercel Analytics is included as a dependency for aggregate page metrics.

## Integrity controls

- Figures are computed in code and supplied to the model; the model does not calculate.
- The official close comes from the exchange's 16:00 bar, not a quote that drifts after hours ([ADR 0005](adr/0005-official-close-from-the-1600-bar.md)).
- Failed reads throw rather than publish empty state ([ADR 0004](adr/0004-failed-reads-throw.md)).
- Retention never empties a table.
