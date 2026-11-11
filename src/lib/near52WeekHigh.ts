import { getMarketStatus } from "./marketHours";
import { FO_STOCKS } from "./symbols";
import {
  equityChangePct,
  fetchFoEquityQuotes,
} from "./upstox/equityQuotes";
import type {
  Near52WeekHighResponse,
  Near52WeekHighRow,
} from "./near52WeekHighTypes";

export type {
  Near52WeekHighResponse,
  Near52WeekHighRow,
} from "./near52WeekHighTypes";

/**
 * Chartink Near 52 week high:
 *   Daily Close - Daily Max(252, Daily high) / Daily Max(252, Daily high) as '% High'
 *   Daily close as 'ltp'
 *   Daily volume as 'volume'
 *   Daily Close - 1 day ago close / 1 day ago close * 100 as '% change'
 *
 * Fast path: Upstox quote year_high ≈ 52-week / Max(252, high).
 * (Close − year_high) / year_high × 100; nearest to high first.
 */

let cache: { at: number; data: Near52WeekHighResponse } | null = null;
const CACHE_MS = 30_000;

export async function computeNear52WeekHigh(
  force = false,
): Promise<Near52WeekHighResponse> {
  const now = Date.now();
  if (!force && cache && now - cache.at < CACHE_MS) {
    return cache.data;
  }

  if (!process.env.UPSTOX_ACCESS_TOKEN?.trim()) {
    const data: Near52WeekHighResponse = {
      updatedAt: new Date().toISOString(),
      marketStatus: getMarketStatus(),
      universe: FO_STOCKS.length,
      scanned: 0,
      rows: [],
      source: "upstox",
      error:
        "UPSTOX_ACCESS_TOKEN missing. Add it to .env.local and restart the server.",
    };
    cache = { at: now, data };
    return data;
  }

  try {
    const quotes = await fetchFoEquityQuotes(false, force);
    const rows: Near52WeekHighRow[] = [];

    for (const meta of FO_STOCKS) {
      const q = quotes.get(meta.symbol);
      if (!q) continue;

      const maxHigh = Number(q.year_high ?? 0);
      const ltp = Number(q.last_price ?? 0);
      const volume = Number(q.volume ?? 0);
      if (!(maxHigh > 0) || !(ltp > 0)) continue;

      const pctHigh = ((ltp - maxHigh) / maxHigh) * 100;
      if (!Number.isFinite(pctHigh)) continue;

      const changePct = equityChangePct(q);
      if (!Number.isFinite(changePct)) continue;

      rows.push({
        symbol: meta.symbol,
        name: meta.name,
        sector: meta.sector,
        ltp,
        volume,
        pctHigh,
        maxHigh252: maxHigh,
        changePct,
      });
    }

    rows.sort(
      (a, b) => b.pctHigh - a.pctHigh || b.changePct - a.changePct,
    );

    const data: Near52WeekHighResponse = {
      updatedAt: new Date().toISOString(),
      marketStatus: getMarketStatus(),
      universe: FO_STOCKS.length,
      scanned: rows.length,
      rows,
      source: "upstox",
      ...(rows.length === 0
        ? {
            error:
              "No year_high on Upstox quotes. Try Refresh, or check token/API payload.",
          }
        : {}),
    };
    cache = { at: now, data };
    return data;
  } catch (e) {
    const data: Near52WeekHighResponse = {
      updatedAt: new Date().toISOString(),
      marketStatus: getMarketStatus(),
      universe: FO_STOCKS.length,
      scanned: 0,
      rows: [],
      source: "upstox",
      error:
        e instanceof Error ? e.message : "Near 52 week high failed",
    };
    cache = { at: now, data };
    return data;
  }
}
