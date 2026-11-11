import { getMarketStatus } from "./marketHours";
import { FO_STOCKS } from "./symbols";
import {
  fetchFoEquityQuotes,
  type EquityQuote,
} from "./upstox/equityQuotes";
import { fetchIntraday5m, fetchIntraday1m, mapPool } from "./yahoo";
import type { BullVsBearResponse } from "./bullVsBearTypes";

export type { BullVsBearResponse } from "./bullVsBearTypes";

/**
 * Chartink Bull vs Bear:
 *   groupcount({cash} 1 where [0] 5 minute close > 1 day ago close) as 'Bull'
 *   groupcount({cash} 1 where [0] 5 minute close < 1 day ago close) as 'Bear'
 *
 * Universe here = NSE F&O cash underlyings (app cash set).
 * Live last ≈ current 5m bar close; prev_close = 1 day ago close.
 */

let cache: { at: number; data: BullVsBearResponse } | null = null;
const CACHE_MS = 30_000;

function classify(last: number, prevClose: number): "bull" | "bear" | "flat" | null {
  if (!(last > 0) || !(prevClose > 0)) return null;
  if (last > prevClose) return "bull";
  if (last < prevClose) return "bear";
  return "flat";
}

function quoteSide(q: EquityQuote): "bull" | "bear" | "flat" | null {
  const last = Number(q.last_price ?? 0);
  const prev = Number(q.prev_close_price ?? q.ohlc?.close ?? 0);
  return classify(last, prev);
}

async function fromUpstox(): Promise<{
  bull: number;
  bear: number;
  flat: number;
  scanned: number;
}> {
  const quotes = await fetchFoEquityQuotes(false, false);
  let bull = 0;
  let bear = 0;
  let flat = 0;
  let scanned = 0;
  for (const meta of FO_STOCKS) {
    const q = quotes.get(meta.symbol);
    if (!q) continue;
    const side = quoteSide(q);
    if (!side) continue;
    scanned += 1;
    if (side === "bull") bull += 1;
    else if (side === "bear") bear += 1;
    else flat += 1;
  }
  return { bull, bear, flat, scanned };
}

/** Fallback: latest 5m close vs Yahoo previousClose (1d chart meta). */
async function fromYahoo(): Promise<{
  bull: number;
  bear: number;
  flat: number;
  scanned: number;
}> {
  const rows = await mapPool(FO_STOCKS, 16, async (meta) => {
    try {
      const [m5, day] = await Promise.all([
        fetchIntraday5m(meta.symbol),
        fetchIntraday1m(meta.symbol),
      ]);
      const last5 = m5.length ? m5[m5.length - 1].close : 0;
      const last = last5 > 0 ? last5 : day.last;
      const prev = day.previousClose;
      return classify(last, prev);
    } catch {
      return null;
    }
  });

  let bull = 0;
  let bear = 0;
  let flat = 0;
  let scanned = 0;
  for (const side of rows) {
    if (!side) continue;
    scanned += 1;
    if (side === "bull") bull += 1;
    else if (side === "bear") bear += 1;
    else flat += 1;
  }
  return { bull, bear, flat, scanned };
}

function pack(
  counts: { bull: number; bear: number; flat: number; scanned: number },
  source: "upstox" | "yahoo",
  error?: string,
): BullVsBearResponse {
  const decided = counts.bull + counts.bear;
  return {
    updatedAt: new Date().toISOString(),
    marketStatus: getMarketStatus(),
    universe: FO_STOCKS.length,
    scanned: counts.scanned,
    bull: counts.bull,
    bear: counts.bear,
    flat: counts.flat,
    net: counts.bull - counts.bear,
    bullPct: decided ? (counts.bull / decided) * 100 : 50,
    source,
    ...(error ? { error } : {}),
  };
}

export async function computeBullVsBear(
  force = false,
): Promise<BullVsBearResponse> {
  const now = Date.now();
  if (!force && cache && now - cache.at < CACHE_MS) {
    return cache.data;
  }

  try {
    if (process.env.UPSTOX_ACCESS_TOKEN?.trim()) {
      const counts = await fromUpstox();
      if (counts.scanned > 0) {
        const data = pack(counts, "upstox");
        cache = { at: now, data };
        return data;
      }
    }
  } catch (e) {
    // Fall through to Yahoo
    const upstoxErr = e instanceof Error ? e.message : "Upstox failed";
    try {
      const counts = await fromYahoo();
      const data = pack(counts, "yahoo", `Upstox unavailable (${upstoxErr})`);
      cache = { at: now, data };
      return data;
    } catch (ye) {
      const data = pack(
        { bull: 0, bear: 0, flat: 0, scanned: 0 },
        "yahoo",
        ye instanceof Error ? ye.message : upstoxErr,
      );
      cache = { at: now, data };
      return data;
    }
  }

  try {
    const counts = await fromYahoo();
    const data = pack(counts, "yahoo");
    cache = { at: now, data };
    return data;
  } catch (e) {
    const data = pack(
      { bull: 0, bear: 0, flat: 0, scanned: 0 },
      "yahoo",
      e instanceof Error ? e.message : "Bull vs Bear failed",
    );
    cache = { at: now, data };
    return data;
  }
}
