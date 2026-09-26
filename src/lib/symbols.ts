// The Top 20 universe the watchlist is picked from, and the 5 Market Overview
// cards. Finnhub's free tier has no "rank US tech by market cap" endpoint, so
// the Top 20 is a fixed large-cap US technology list rather than a live ranking.

export type TopStock = { symbol: string; name: string };

export const TOP_20: TopStock[] = [
  { symbol: "NVDA", name: "NVIDIA" },
  { symbol: "AAPL", name: "Apple" },
  { symbol: "MSFT", name: "Microsoft" },
  { symbol: "GOOGL", name: "Alphabet" },
  { symbol: "AMZN", name: "Amazon" },
  { symbol: "META", name: "Meta Platforms" },
  { symbol: "AVGO", name: "Broadcom" },
  { symbol: "TSLA", name: "Tesla" },
  { symbol: "ORCL", name: "Oracle" },
  { symbol: "PLTR", name: "Palantir" },
  { symbol: "AMD", name: "AMD" },
  { symbol: "CRM", name: "Salesforce" },
  { symbol: "CSCO", name: "Cisco" },
  { symbol: "ADBE", name: "Adobe" },
  { symbol: "INTC", name: "Intel" },
  { symbol: "QCOM", name: "Qualcomm" },
  { symbol: "TXN", name: "Texas Instruments" },
  { symbol: "MU", name: "Micron" },
  { symbol: "NOW", name: "ServiceNow" },
  { symbol: "INTU", name: "Intuit" },
];

// Finnhub's free tier rejects real index symbols ("^VIX", "^GSPC" ->
// "Market data subscription required for CFD indices"), so every card reads an
// ETF proxy via /quote. `note` is rendered on the card: VIXY tracks VIX
// *futures*, not VIX spot, and the UI should not imply otherwise.
export type IndexCard = { label: string; symbol: string; note: string };

export const INDEX_CARDS: IndexCard[] = [
  { label: "NASDAQ 100", symbol: "QQQ", note: "QQQ ETF proxy" },
  { label: "S&P 500", symbol: "SPY", note: "SPY ETF proxy" },
  { label: "Dow Jones", symbol: "DIA", note: "DIA ETF proxy" },
  { label: "Technology", symbol: "XLK", note: "XLK sector ETF" },
  // This card was once drawn in neutral ink on the argument that a falling
  // volatility future is a calmer market, so red would be the product judging
  // the news. It was reverted on sight: VIXY is an ETF with a price, the price
  // did fall, and red reports the same fact here as on the other four. The
  // "bad news" reading is the viewer's inference, not the card's claim — and
  // one card in a row of five wearing a different colour reads as a fault
  // rather than as a distinction. Do not re-propose it without new evidence.
  { label: "Volatility", symbol: "VIXY", note: "VIXY futures ETF" },
  // The one sub-sector proxy this v1 ships — a semiconductor read distinct
  // from (and complementary to) XLK's whole-Technology-sector figure. SOXX
  // and SMH were both confirmed live against the current free Finnhub key
  // during scoping; SOXX is the one carried into the spec.
  { label: "Semiconductors", symbol: "SOXX", note: "SOXX sector ETF" },
];

/**
 * 2-4 peer tickers per Top-20 symbol, from a one-time manual lookup (Finnhub
 * `/stock/peers`, cross-checked by hand) rather than a live per-tick call —
 * peer relationships don't change day to day. Every value is itself a
 * TOP_20_SYMBOLS member, which is what lets the Peers card read peer prices
 * out of price_cache (already holding every Top-20 row) with zero new
 * upstream calls.
 *
 * TSLA has no real automotive peer in this tech-only universe, so its entries
 * are the closest adjacent large-cap tech names rather than a true peer set —
 * the one deliberate compromise in this table.
 */
export const PEERS: Record<string, string[]> = {
  NVDA: ["AMD", "AVGO", "QCOM"],
  AAPL: ["MSFT", "GOOGL", "AMZN"],
  MSFT: ["GOOGL", "AAPL", "ORCL", "CRM"],
  GOOGL: ["MSFT", "META", "AMZN"],
  AMZN: ["MSFT", "GOOGL", "META"],
  META: ["GOOGL", "AMZN", "MSFT"],
  AVGO: ["QCOM", "TXN", "NVDA", "MU"],
  TSLA: ["NVDA", "AMD"],
  ORCL: ["MSFT", "CRM", "NOW", "ADBE"],
  PLTR: ["NOW", "CRM"],
  AMD: ["NVDA", "INTC", "QCOM"],
  CRM: ["ORCL", "NOW", "ADBE", "INTU"],
  CSCO: ["AVGO", "QCOM", "INTC"],
  ADBE: ["CRM", "INTU", "MSFT"],
  INTC: ["AMD", "QCOM", "TXN", "MU"],
  QCOM: ["AVGO", "TXN", "NVDA"],
  TXN: ["QCOM", "AVGO", "MU"],
  MU: ["INTC", "TXN", "QCOM"],
  NOW: ["CRM", "ORCL", "ADBE"],
  INTU: ["ADBE", "CRM", "NOW"],
};

/**
 * SEC EDGAR CIK (Central Index Key) for each Top-20 symbol, sourced once from
 * SEC's public ticker-to-CIK mapping file (`www.sec.gov/files/company_tickers.json`,
 * confirmed live for all 20 during implementation) rather than fetched at
 * runtime — same "one-time manual lookup" posture as PEERS above. Used by
 * `src/lib/sec-edgar.ts` to query SEC's per-company submissions endpoint.
 * Stored as the unpadded numeric string SEC's mapping file gives; the caller
 * left-pads to 10 digits for the submissions URL.
 */
export const CIK_BY_SYMBOL: Record<string, string> = {
  NVDA: "1045810",
  AAPL: "320193",
  MSFT: "789019",
  GOOGL: "1652044",
  AMZN: "1018724",
  META: "1326801",
  AVGO: "1730168",
  TSLA: "1318605",
  ORCL: "1341439",
  PLTR: "1321655",
  AMD: "2488",
  CRM: "1108524",
  CSCO: "858877",
  ADBE: "796343",
  INTC: "50863",
  QCOM: "804328",
  TXN: "97476",
  MU: "723125",
  NOW: "1373715",
  INTU: "896878",
};

/**
 * One of 6 sectors per tracked symbol, from a one-time manual lookup — same
 * posture as PEERS above. Backs the News page's sector filter chips and (once
 * built) Market Story's sector-leadership section, both computed by grouping
 * the tracked stocks’ own price moves rather than a live upstream call.
 */
export const SECTOR_BY_SYMBOL: Record<string, string> = {
  NVDA: "Semiconductors",
  AMD: "Semiconductors",
  AVGO: "Semiconductors",
  QCOM: "Semiconductors",
  TXN: "Semiconductors",
  MU: "Semiconductors",
  INTC: "Semiconductors",
  MSFT: "Software/Cloud",
  ORCL: "Software/Cloud",
  CRM: "Software/Cloud",
  ADBE: "Software/Cloud",
  NOW: "Software/Cloud",
  INTU: "Software/Cloud",
  GOOGL: "Internet/Platform",
  META: "Internet/Platform",
  AMZN: "Internet/Platform",
  AAPL: "Hardware/Devices",
  CSCO: "Hardware/Devices",
  PLTR: "AI/Data Analytics",
  TSLA: "EV/Auto",
  ASML: "Semiconductors", LRCX: "Semiconductors", KLAC: "Semiconductors", MRVL: "Semiconductors", ON: "Semiconductors",
  SNOW: "Software/Cloud", WDAY: "Software/Cloud", TEAM: "Software/Cloud", PANW: "Software/Cloud",
  NFLX: "Internet/Platform", UBER: "Internet/Platform", ABNB: "Internet/Platform",
  DELL: "Hardware/Devices", HPQ: "Hardware/Devices", WDC: "Hardware/Devices",
  AI: "AI/Data Analytics", BBAI: "AI/Data Analytics", SOUN: "AI/Data Analytics",
  RIVN: "EV/Auto", LCID: "EV/Auto", GM: "EV/Auto", F: "EV/Auto", NIO: "EV/Auto",
};

export const SECTORS = [...new Set(Object.values(SECTOR_BY_SYMBOL))];

export const INDEX_SYMBOLS = INDEX_CARDS.map((c) => c.symbol);
export const TOP_20_SYMBOLS = TOP_20.map((s) => s.symbol);
export const EXTENDED_STOCKS: TopStock[] = [
  { symbol: "ASML", name: "ASML" }, { symbol: "LRCX", name: "Lam Research" },
  { symbol: "KLAC", name: "KLA" }, { symbol: "MRVL", name: "Marvell" }, { symbol: "ON", name: "onsemi" },
  { symbol: "SNOW", name: "Snowflake" }, { symbol: "WDAY", name: "Workday" },
  { symbol: "TEAM", name: "Atlassian" }, { symbol: "PANW", name: "Palo Alto Networks" },
  { symbol: "NFLX", name: "Netflix" }, { symbol: "UBER", name: "Uber" }, { symbol: "ABNB", name: "Airbnb" },
  { symbol: "DELL", name: "Dell" }, { symbol: "HPQ", name: "HP Inc." }, { symbol: "WDC", name: "Western Digital" },
  { symbol: "AI", name: "C3.ai" }, { symbol: "BBAI", name: "BigBear.ai" }, { symbol: "SOUN", name: "SoundHound AI" },
  { symbol: "RIVN", name: "Rivian" }, { symbol: "LCID", name: "Lucid" },
  { symbol: "GM", name: "General Motors" }, { symbol: "F", name: "Ford" }, { symbol: "NIO", name: "NIO" },
];
export const EXTENDED_SYMBOLS = EXTENDED_STOCKS.map((stock) => stock.symbol);
export const TRACKED_STOCK_SYMBOLS = [...TOP_20_SYMBOLS, ...EXTENDED_SYMBOLS];
export const ALL_SYMBOLS = [...TOP_20_SYMBOLS, ...INDEX_SYMBOLS];

export const NAME_BY_SYMBOL = new Map([...TOP_20, ...EXTENDED_STOCKS].map((s) => [s.symbol, s.name]));

/**
 * Words that mean an article genuinely concerns a company, used to check
 * Finnhub's ticker tagging. Finnhub attaches a queried symbol to roughly half
 * its company-news results without the article being about that company at all
 * (a Yeti story tagged NVDA, for example), so a tag alone is not evidence.
 *
 * Matching is plain string containment — deliberately not an AI judgement, per
 * the rule that related tickers come from Finnhub's field and are never inferred
 * by a model.
 */
export const SYMBOL_ALIASES: Record<string, string[]> = {
  NVDA: ["nvidia", "nvda"],
  AAPL: ["apple", "aapl"],
  MSFT: ["microsoft", "msft"],
  GOOGL: ["alphabet", "google", "googl"],
  AMZN: ["amazon", "amzn"],
  META: ["meta", "facebook", "instagram"],
  AVGO: ["broadcom", "avgo"],
  TSLA: ["tesla", "tsla"],
  ORCL: ["oracle", "orcl"],
  PLTR: ["palantir", "pltr"],
  AMD: ["amd", "advanced micro"],
  CRM: ["salesforce", "crm"],
  CSCO: ["cisco", "csco"],
  ADBE: ["adobe", "adbe"],
  INTC: ["intel", "intc"],
  QCOM: ["qualcomm", "qcom"],
  TXN: ["texas instruments", "txn"],
  MU: ["micron", "mu"],
  NOW: ["servicenow"],
  INTU: ["intuit", "intu"],
  ASML: ["asml"], LRCX: ["lam research", "lrcx"], KLAC: ["kla", "klac"], MRVL: ["marvell", "mrvl"],
  ON: ["onsemi", "on semiconductor"],
  SNOW: ["snowflake"], WDAY: ["workday", "wday"], TEAM: ["atlassian"], PANW: ["palo alto networks", "panw"],
  NFLX: ["netflix", "nflx"], UBER: ["uber"], ABNB: ["airbnb", "abnb"],
  DELL: ["dell"], HPQ: ["hp inc", "hewlett-packard", "hpq"], WDC: ["western digital", "wdc"],
  AI: ["c3.ai", "c3 ai"], BBAI: ["bigbear.ai", "bigbear ai", "bbai"], SOUN: ["soundhound", "soun"],
  RIVN: ["rivian", "rivn"], LCID: ["lucid", "lcid"], GM: ["general motors", "gm"],
  F: ["ford"], NIO: ["nio"],
};

/** True when `text` actually references the company behind `symbol`. */
export function mentionsSymbol(symbol: string, text: string): boolean {
  const aliases = SYMBOL_ALIASES[symbol];
  if (!aliases) return false;

  const haystack = text.toLowerCase();
  return aliases.some((alias) =>
    // Short aliases like "mu" and "amd" need word boundaries or they match
    // inside ordinary words ("much", "amds").
    alias.length <= 4
      ? new RegExp(`\\b${alias}\\b`).test(haystack)
      : haystack.includes(alias),
  );
}
