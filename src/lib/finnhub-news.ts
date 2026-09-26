// Finnhub news endpoints. Read-only fetch + normalisation; storage and
// summarisation live in lib/news-ingest.ts.

import { mentionsSymbol } from "@/lib/symbols";

const BASE = "https://finnhub.io/api/v1";

export type RawArticle = {
  finnhubId: number;
  headline: string;
  /** Finnhub's own snippet. Used only as AI input — never displayed. */
  snippet: string;
  sourceUrl: string;
  imageUrl: string | null;
  relatedSymbols: string[];
  publishedAt: Date;
};

type FinnhubArticle = {
  id: number;
  headline?: string;
  summary?: string;
  url?: string;
  image?: string;
  related?: string;
  datetime?: number;
};

// Company news is high volume — a single symbol returned 141 articles across two
// days — so each source is capped. Without this a cycle would hand hundreds of
// articles to one AI call and bury the page in near-duplicates.
//
// The per-symbol cap is set above the number actually kept because the
// relevance filter below discards roughly half of what Finnhub returns.
//
// 8 rather than 4: at 4 a genuinely busy stock lost articles at the fetch step,
// before storage ever saw them — NVDA had 12 in one ET day, which four per
// cycle could not carry. Raising it costs no extra Finnhub calls (the cap is
// applied to one response, not per request) and no extra AI calls, since
// summarisation is capped separately in news-ingest.ts. It does mean the first
// cycle after this change stores a large one-time backlog; blurbs backfill
// newest-first over the following cycles.
const PER_SYMBOL = 8;
const PER_FEED = 15;

async function get(path: string, jobSignal: AbortSignal): Promise<FinnhubArticle[]> {
  const res = await fetch(`${BASE}${path}&token=${process.env.FINNHUB_API_KEY}`, {
    cache: "no-store",
    signal: AbortSignal.any([jobSignal, AbortSignal.timeout(10_000)]),
  });
  if (!res.ok) throw new Error(`Finnhub ${path.split("?")[0]} -> ${res.status}`);
  const json = (await res.json()) as unknown;
  return Array.isArray(json) ? (json as FinnhubArticle[]) : [];
}

function normalise(
  raw: FinnhubArticle,
  fallbackSymbol?: string,
): RawArticle | null {
  if (!raw.id || !raw.headline || !raw.url || !raw.datetime) return null;

  // Finnhub packs tickers into a comma-separated string, and tags them loosely:
  // an article can carry a symbol it never mentions. Tickers still come only
  // from this field — never inferred by a model — but each one has to be
  // supported by the article text before it is shown as a Related Stock chip.
  const text = `${raw.headline ?? ""} ${raw.summary ?? ""}`;
  const related = (raw.related ?? "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter((s) => s && mentionsSymbol(s, text));

  // The queried symbol already passed the relevance check upstream.
  if (fallbackSymbol && !related.includes(fallbackSymbol)) {
    related.unshift(fallbackSymbol);
  }

  return {
    finnhubId: raw.id,
    headline: raw.headline,
    snippet: raw.summary ?? "",
    sourceUrl: raw.url,
    // Still captured so the column stays populated, but nothing renders it:
    // thumbnails are company logos. See components/news-thumbnail.tsx.
    imageUrl: raw.image?.trim() ? raw.image : null,
    relatedSymbols: [...new Set(related)],
    publishedAt: new Date(raw.datetime * 1000),
  };
}

const isoDate = (d: Date) => d.toISOString().slice(0, 10);

async function companyNews(
  symbols: string[],
  from: string,
  to: string,
  errors: string[],
  jobSignal: AbortSignal,
): Promise<RawArticle[]> {
  const feeds: RawArticle[][] = [];
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(5, symbols.length) }, async () => {
    while (next < symbols.length) {
      const index = next++;
      const symbol = symbols[index];
      try {
        const raw = await get(
          `/company-news?symbol=${encodeURIComponent(symbol)}&from=${from}&to=${to}`,
          jobSignal,
        );
        feeds[index] = raw
          .filter((a) => mentionsSymbol(symbol, `${a.headline ?? ""} ${a.summary ?? ""}`))
          .slice(0, PER_SYMBOL)
          .flatMap((a) => normalise(a, symbol) ?? []);
      } catch (error) {
        // Swallowing this silently would make a rate-limited cycle look
        // identical to a quiet news day, which is the failure mode Risk #3
        // in CLAUDE.md is about.
        errors.push(
          `${symbol}: ${error instanceof Error ? error.message : "fetch failed"}`,
        );
        feeds[index] = [];
      }
    }
  }));
  return feeds.flat();
}

/**
 * Two sources, and why the split between them is not decided here.
 *
 * Finnhub's free tier has no technology-specific news feed: `/news?category=
 * technology` and `/news?category=general` return byte-identical article sets
 * (verified — 100 of 100 ids overlap), carrying no tickers and no tech signal.
 * Labelling that feed "Technology Industry News" would be plainly wrong, since
 * it is general business and world news. So the page's Company/Industry split
 * is drawn from Finnhub's own per-symbol tagging instead.
 *
 * Ingestion fetches all 43 tracked stocks; the page derives Stock/Market
 * and sector filters from the stored company tags.
 *
 * No AI infers any of this, per the rule that tickers come from Finnhub's field.
 */
export async function fetchAllNews(
  symbols: string[],
  { timeoutMs = 25_000 }: { timeoutMs?: number } = {},
): Promise<{ articles: RawArticle[]; errors: string[] }> {
  // Nine worker waves must not consume the whole 60-second ingestion function.
  const jobSignal = AbortSignal.timeout(timeoutMs);
  const today = new Date();
  const from = isoDate(new Date(today.getTime() - 2 * 24 * 60 * 60 * 1000));
  const to = isoDate(today);
  const errors: string[] = [];

  const marketFeed = async (): Promise<RawArticle[]> => {
    try {
      const raw = await get(`/news?category=general`, jobSignal);
      return raw.slice(0, PER_FEED).flatMap((a) => normalise(a) ?? []);
    } catch (error) {
      errors.push(
        `market feed: ${error instanceof Error ? error.message : "fetch failed"}`,
      );
      return [];
    }
  };

  const [perSymbol, market] = await Promise.all([
    companyNews(symbols, from, to, errors, jobSignal),
    marketFeed(),
  ]);

  // An article can carry several tickers and appear in more than one feed.
  // Order matters: a per-symbol hit keeps the ticker that the general feed's
  // copy of the same article would not carry.
  const byId = new Map<number, RawArticle>();
  for (const article of [...perSymbol, ...market]) {
    const existing = byId.get(article.finnhubId);
    if (existing) {
      existing.relatedSymbols = [...new Set([...existing.relatedSymbols, ...article.relatedSymbols])];
    } else {
      byId.set(article.finnhubId, article);
    }
  }
  return { articles: [...byId.values()], errors };
}
