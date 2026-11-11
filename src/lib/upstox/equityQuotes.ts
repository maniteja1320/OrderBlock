import { loadFoEquityInstruments } from "./equityInstruments";

export interface EquityQuote {
  instrument_token?: string;
  symbol?: string;
  last_price?: number;
  net_change?: number;
  volume?: number;
  average_price?: number;
  year_high?: number;
  year_low?: number;
  prev_close_price?: number;
  total_buy_quantity?: number;
  total_sell_quantity?: number;
  ohlc?: {
    open?: number;
    high?: number;
    low?: number;
    close?: number;
  };
  depth?: {
    buy?: Array<{ quantity?: number; price?: number }>;
    sell?: Array<{ quantity?: number; price?: number }>;
  };
}

function getAccessToken(): string {
  const token = process.env.UPSTOX_ACCESS_TOKEN?.trim();
  if (!token) {
    throw new Error("UPSTOX_ACCESS_TOKEN is not set.");
  }
  return token;
}

let quoteCache: { at: number; data: Map<string, EquityQuote> } | null = null;
let quoteInflight: Promise<Map<string, EquityQuote>> | null = null;
const QUOTE_CACHE_MS = 20_000;

/**
 * Full market quotes for F&O equity underlyings (Upstox v2/v3 quotes).
 * Short in-memory TTL + in-flight dedupe so Chartink boards share one pull.
 */
export async function fetchFoEquityQuotes(
  forceInstrumentRefresh = false,
  forceQuoteRefresh = false,
): Promise<Map<string, EquityQuote>> {
  const now = Date.now();
  if (
    !forceQuoteRefresh &&
    quoteCache &&
    now - quoteCache.at < QUOTE_CACHE_MS
  ) {
    return quoteCache.data;
  }
  if (!forceQuoteRefresh && quoteInflight) {
    return quoteInflight;
  }

  const run = (async () => {
    const token = getAccessToken();
    const equities = await loadFoEquityInstruments(forceInstrumentRefresh);
    const keys = [...equities.values()].map((e) => e.instrumentKey);
    const byKey = new Map(equities);
    const out = new Map<string, EquityQuote>();
    const chunkSize = 80;

    for (let i = 0; i < keys.length; i += chunkSize) {
      const chunk = keys.slice(i, i + chunkSize);
      const qs = chunk.map(encodeURIComponent).join(",");
      // Prefer v3 (year_high / year_low); fall back to v2.
      let json: { data?: Record<string, EquityQuote> } | null = null;
      for (const base of [
        "https://api.upstox.com/v3/market-quote/quotes",
        "https://api.upstox.com/v2/market-quote/quotes",
      ]) {
        const res = await fetch(`${base}?instrument_key=${qs}`, {
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${token}`,
          },
          cache: "no-store",
        });
        const text = await res.text();
        if (!res.ok) {
          if (base.includes("/v3/")) continue;
          throw new Error(
            `Upstox equity quotes failed (${res.status}): ${text.slice(0, 180)}`,
          );
        }
        json = JSON.parse(text) as { data?: Record<string, EquityQuote> };
        break;
      }
      if (!json?.data) continue;

      for (const [respKey, quote] of Object.entries(json.data)) {
        const tokenKey =
          quote.instrument_token?.replace(/:/g, "|") ??
          respKey.replace(/:/g, "|");
        // Resolve trading symbol from instrument map.
        let symbol: string | null = null;
        for (const [sym, eq] of byKey) {
          if (
            eq.instrumentKey === tokenKey ||
            eq.instrumentKey.replace(/\|/g, ":") === respKey ||
            eq.tradingSymbol === quote.symbol
          ) {
            symbol = sym;
            break;
          }
        }
        if (!symbol && quote.symbol) {
          symbol = quote.symbol.toUpperCase();
        }
        if (!symbol) continue;
        out.set(symbol, quote);
      }
    }

    quoteCache = { at: Date.now(), data: out };
    return out;
  })();

  quoteInflight = run;
  try {
    return await run;
  } finally {
    if (quoteInflight === run) quoteInflight = null;
  }
}

/** Session % change from Upstox equity quote (vs prev close / open). */
export function equityChangePct(q: EquityQuote): number {
  const last = Number(q.last_price ?? 0);
  const prev = Number(q.prev_close_price ?? q.ohlc?.close ?? 0);
  if (last > 0 && prev > 0) return ((last - prev) / prev) * 100;
  const open = Number(q.ohlc?.open ?? 0);
  if (last > 0 && open > 0) return ((last - open) / open) * 100;
  const net = Number(q.net_change ?? NaN);
  if (last > 0 && Number.isFinite(net) && last !== net) {
    const p = last - net;
    if (p > 0) return (net / p) * 100;
  }
  return 0;
}
