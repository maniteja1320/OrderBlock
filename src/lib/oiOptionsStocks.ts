import { getMarketStatus } from "./marketHours";
import { FO_STOCKS } from "./symbols";
import {
  equityChangePct,
  fetchFoEquityQuotes,
} from "./upstox/equityQuotes";
import type {
  OiOptionsStockRow,
  OiOptionsStocksResponse,
} from "./oiOptionsStocksTypes";

export type {
  OiOptionsStockRow,
  OiOptionsStocksResponse,
} from "./oiOptionsStocksTypes";

/**
 * Chartink Open Interest Options Stocks columns:
 *   Daily close - 1 day ago Close / 1 day ago close * 100 as '% Change'
 *   Daily close as 'Price'
 *   Daily volume as 'Volume'
 *
 * Universe = F&O cash underlyings (options stocks). Live via Upstox quotes.
 */

let cache: { at: number; data: OiOptionsStocksResponse } | null = null;
const CACHE_MS = 30_000;

export async function computeOiOptionsStocks(
  force = false,
): Promise<OiOptionsStocksResponse> {
  const now = Date.now();
  if (!force && cache && now - cache.at < CACHE_MS) {
    return cache.data;
  }

  if (!process.env.UPSTOX_ACCESS_TOKEN?.trim()) {
    const data: OiOptionsStocksResponse = {
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
    const rows: OiOptionsStockRow[] = [];

    for (const meta of FO_STOCKS) {
      const q = quotes.get(meta.symbol);
      if (!q) continue;

      const price = Number(q.last_price ?? 0);
      const volume = Number(q.volume ?? 0);
      if (!(price > 0)) continue;

      const changePct = equityChangePct(q);
      if (!Number.isFinite(changePct)) continue;

      rows.push({
        symbol: meta.symbol,
        name: meta.name,
        sector: meta.sector,
        price,
        volume,
        changePct,
      });
    }

    rows.sort(
      (a, b) =>
        Math.abs(b.changePct) - Math.abs(a.changePct) ||
        b.changePct - a.changePct,
    );

    const data: OiOptionsStocksResponse = {
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
    const data: OiOptionsStocksResponse = {
      updatedAt: new Date().toISOString(),
      marketStatus: getMarketStatus(),
      universe: FO_STOCKS.length,
      scanned: 0,
      rows: [],
      source: "upstox",
      error:
        e instanceof Error
          ? e.message
          : "Open Interest Options Stocks failed",
    };
    cache = { at: now, data };
    return data;
  }
}
