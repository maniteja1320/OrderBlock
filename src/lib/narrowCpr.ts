import { getIstClock, getMarketStatus } from "./marketHours";
import { FO_STOCKS } from "./symbols";
import type { Candle } from "./types";
import { loadFoEquityDailyCandles } from "./upstox/equityCandles";
import {
  equityChangePct,
  fetchFoEquityQuotes,
} from "./upstox/equityQuotes";
import type { NarrowCprResponse, NarrowCprRow } from "./narrowCprTypes";

export type { NarrowCprResponse, NarrowCprRow } from "./narrowCprTypes";

/**
 * Chartink Intraday Narrow CPR display columns:
 *   Daily close - 1 day ago close / 1 day ago close * 100 as '% change'
 *   Daily close as 'price'
 *   Daily volume as 'volume'
 *
 * CPR from prior session OHLC (Upstox daily):
 *   Pivot = (H+L+C)/3 · BC = (H+L)/2 · TC = 2*Pivot − BC
 *   Ranked by (TC−BC)/Pivot × 100 (descending — widest first).
 */

let cache: { at: number; data: NarrowCprResponse } | null = null;
const CACHE_MS = 60_000;

function priorDayBar(daily: Candle[], istDate: string): Candle | null {
  for (let i = daily.length - 1; i >= 0; i--) {
    const c = daily[i];
    const d = new Date(c.time * 1000).toLocaleDateString("en-CA", {
      timeZone: "Asia/Kolkata",
    });
    if (d !== istDate && c.high > 0 && c.low > 0 && c.close > 0) {
      return c;
    }
  }
  return null;
}

function cprWidthPct(high: number, low: number, close: number): number | null {
  if (!(high > 0 && low > 0 && close > 0) || high < low) return null;
  const pivot = (high + low + close) / 3;
  const bc = (high + low) / 2;
  const tc = 2 * pivot - bc;
  if (!(pivot > 0)) return null;
  const width = Math.abs(tc - bc);
  return (width / pivot) * 100;
}

export async function computeNarrowCpr(
  force = false,
): Promise<NarrowCprResponse> {
  const now = Date.now();
  if (!force && cache && now - cache.at < CACHE_MS) {
    return cache.data;
  }

  if (!process.env.UPSTOX_ACCESS_TOKEN?.trim()) {
    const data: NarrowCprResponse = {
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
    const istDate = getIstClock().date;
    const [dailyMap, quotes] = await Promise.all([
      loadFoEquityDailyCandles({ force, concurrency: 4 }),
      fetchFoEquityQuotes(false, force),
    ]);

    const rows: NarrowCprRow[] = [];
    for (const meta of FO_STOCKS) {
      const daily = dailyMap.get(meta.symbol);
      if (!daily?.length) continue;

      const prior = priorDayBar(daily, istDate);
      if (!prior) continue;

      const widthPct = cprWidthPct(prior.high, prior.low, prior.close);
      if (widthPct == null || !Number.isFinite(widthPct)) continue;

      const q = quotes.get(meta.symbol);
      const price = Number(q?.last_price ?? 0);
      const volume = Number(q?.volume ?? 0);
      if (!(price > 0)) continue;

      const changePct = q ? equityChangePct(q) : 0;
      if (!Number.isFinite(changePct)) continue;

      rows.push({
        symbol: meta.symbol,
        name: meta.name,
        sector: meta.sector,
        price,
        volume,
        changePct,
        cprWidthPct: widthPct,
      });
    }

    rows.sort(
      (a, b) =>
        b.cprWidthPct - a.cprWidthPct ||
        Math.abs(b.changePct) - Math.abs(a.changePct),
    );

    const data: NarrowCprResponse = {
      updatedAt: new Date().toISOString(),
      marketStatus: getMarketStatus(),
      universe: FO_STOCKS.length,
      scanned: rows.length,
      rows,
      source: "upstox",
    };
    cache = { at: now, data };
    return data;
  } catch (e) {
    const data: NarrowCprResponse = {
      updatedAt: new Date().toISOString(),
      marketStatus: getMarketStatus(),
      universe: FO_STOCKS.length,
      scanned: 0,
      rows: [],
      source: "upstox",
      error:
        e instanceof Error ? e.message : "Intraday Narrow CPR failed",
    };
    cache = { at: now, data };
    return data;
  }
}
