// Company marks, hotlinked from Brandfetch's Logo CDN.
//
// Why hotlinked rather than vendored under public/logos/: Brandfetch's terms
// license downloading and caching Content for at most thirty days and grant no
// right to reproduce or redistribute the underlying brand assets, which remain
// third-party IP. Committing the marks into this repo would outlive that
// window, so the CDN is the delivery path their licence actually contemplates —
// these URLs are built for direct browser rendering and carry a client id that
// is public by design (it is visible in page source on every render).
//
// This is the only place the app fetches from a third party in the browser, and
// it is deliberately outside the "no client-triggered upstream API calls" rule.
// That rule exists to keep page traffic away from metered quotas — Finnhub at
// 60 calls/min, Gemini at 20 requests/day — where a burst of visitors would
// starve the ingestion jobs. The Logo CDN is a free static-asset host with a
// 500k requests/month allowance, so page views cannot exhaust anything the app
// depends on. No data ever comes back from it, only images.
//
// `theme/dark` selects the dark-inked variant of a mark, which is the one that
// reads on the light plate the components draw. `theme/light` returns the white
// knock-out variant where it exists at all, and would be invisible here — this
// was checked in a browser, not assumed, because the naming reads backwards.
const CLIENT_ID = "1id9EpwYGkeL6X3l9Ad";

type MarkType = "symbol" | "logo" | "icon";

/**
 * The mark to draw for all 43 tracked stocks, plus the asset type that reads best
 * at badge size.
 *
 * `symbol` is a standalone square-ish mark and is preferred wherever the brand
 * has one. Otherwise use the wordmark lockup, which the plate can hold.
 * C3 AI only exposes a light wordmark; its dark icon reads on the light plate.
 *
 * Both the domain and the type were verified by rendering every entry in a real
 * browser against the live CDN. They could not be checked any other way:
 * Brandfetch blocks script and server-side fetches of these URLs, returning an
 * HTML page rather than an image, so curl reports success for marks that do not
 * exist.
 *
 * GOOGL points at google.com rather than the ticker's own abc.xyz, which
 * resolves to the "Alphabet" wordmark instead of the Google G.
 */
const MARKS: Record<string, { domain: string; type: MarkType }> = {
  NVDA: { domain: "nvidia.com", type: "symbol" },
  AAPL: { domain: "apple.com", type: "logo" },
  MSFT: { domain: "microsoft.com", type: "symbol" },
  GOOGL: { domain: "google.com", type: "symbol" },
  AMZN: { domain: "amazon.com", type: "symbol" },
  META: { domain: "meta.com", type: "logo" },
  AVGO: { domain: "broadcom.com", type: "symbol" },
  TSLA: { domain: "tesla.com", type: "symbol" },
  ORCL: { domain: "oracle.com", type: "symbol" },
  PLTR: { domain: "palantir.com", type: "symbol" },
  AMD: { domain: "amd.com", type: "symbol" },
  CRM: { domain: "salesforce.com", type: "symbol" },
  CSCO: { domain: "cisco.com", type: "logo" },
  ADBE: { domain: "adobe.com", type: "symbol" },
  INTC: { domain: "intel.com", type: "logo" },
  QCOM: { domain: "qualcomm.com", type: "logo" },
  TXN: { domain: "ti.com", type: "symbol" },
  MU: { domain: "micron.com", type: "logo" },
  NOW: { domain: "servicenow.com", type: "logo" },
  INTU: { domain: "intuit.com", type: "logo" },
  ASML: { domain: "asml.com", type: "logo" },
  LRCX: { domain: "lamresearch.com", type: "symbol" },
  KLAC: { domain: "kla.com", type: "symbol" },
  MRVL: { domain: "marvell.com", type: "symbol" },
  ON: { domain: "onsemi.com", type: "logo" },
  SNOW: { domain: "snowflake.com", type: "symbol" },
  WDAY: { domain: "workday.com", type: "logo" },
  TEAM: { domain: "atlassian.com", type: "symbol" },
  PANW: { domain: "paloaltonetworks.com", type: "symbol" },
  NFLX: { domain: "netflix.com", type: "symbol" },
  UBER: { domain: "uber.com", type: "logo" },
  ABNB: { domain: "airbnb.com", type: "symbol" },
  DELL: { domain: "dell.com", type: "logo" },
  HPQ: { domain: "hp.com", type: "logo" },
  WDC: { domain: "westerndigital.com", type: "logo" },
  AI: { domain: "c3.ai", type: "icon" },
  BBAI: { domain: "bigbear.ai", type: "logo" },
  SOUN: { domain: "soundhound.com", type: "logo" },
  RIVN: { domain: "rivian.com", type: "logo" },
  LCID: { domain: "lucidmotors.com", type: "symbol" },
  GM: { domain: "gm.com", type: "logo" },
  F: { domain: "ford.com", type: "logo" },
  NIO: { domain: "nio.com", type: "symbol" },
};

// Height is requested well above the largest size any component draws (36px) so
// the mark stays sharp on a high-DPI screen; width follows the aspect ratio.
//
// `fallback/404` is deliberate and is the only setting that makes a mistake in
// MARKS visible. The alternative, `fallback/transparent`, answers 200 with a
// blank image for a wrong domain or an asset type a brand does not carry, which
// would make every check — the network tab, a manual audit — pass for a mark
// that does not exist. That is the same trap this file documents above for
// curl, so it is worth not rebuilding it here.
//
// Costs nothing visually: measured in Chrome, a 404 under `alt=""` renders as
// an empty plate with no broken-image glyph, identical to `transparent`.
function markUrl(domain: string, type: MarkType): string {
  return `https://cdn.brandfetch.io/${domain}/h/96/theme/dark/fallback/404/type/${type}?c=${CLIENT_ID}`;
}

/** The mark for `symbol`, or null when it is not a tracked stock. */
export function logoSrc(symbol: string): string | null {
  const mark = MARKS[symbol];
  return mark ? markUrl(mark.domain, mark.type) : null;
}

/**
 * Market news belongs to no single company, so its thumbnail carries the data
 * provider's mark. This names the source of the data rather than the article's
 * publisher — a publisher mark is not derivable, since `news.source_url` holds
 * a Finnhub or Google News redirect and the publisher name is never stored.
 * It replaces a rising-arrow glyph that asserted a direction the article could
 * contradict.
 */
export const FINNHUB_LOGO = markUrl("finnhub.io", "logo");

/** Exported for the test that keeps MARKS and the tracked universe in step. */
export const MARK_SYMBOLS = Object.keys(MARKS);
