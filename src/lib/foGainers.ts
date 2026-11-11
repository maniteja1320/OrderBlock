import { getMarketStatus } from "./marketHours";
import { FO_STOCKS } from "./symbols";
import {
  equityChangePct,
  fetchFoEquityQuotes,
} from "./upstox/equityQuotes";
import type { FoGainerRow, FoGainersResponse } from "./foGainersTypes";

export type { FoGainerRow, FoGainersResponse } from "./foGainersTypes";

/**
 * Chartink F&O gainers / losers:
 *   [0] 5 minute close - 1 day ago close / 1 day ago close * 100
 *     as 'changeinpercentage'
 *
 * Live: Upstox LTP ≈ current 5m close; prev_close = 1 day ago close.
 */

type Side = "gainers" | "losers";

const caches: Partial<
  Record<Side, { at: number; data: FoGainersResponse }>
> = {};
const CACHE_MS = 30_000;

async function computeFoMovers(
  side: Side,
  force = false,
): Promise<FoGainersResponse> {
  const now = Date.now();
  const hit = caches[side];
  if (!force && hit && now - hit.at < CACHE_MS) {
    return hit.data;
  }

  const label = side === "gainers" ? "F&O gainers" : "F&O losers";

  if (!process.env.UPSTOX_ACCESS_TOKEN?.trim()) {
    const data: FoGainersResponse = {
      updatedAt: new Date().toISOString(),
      marketStatus: getMarketStatus(),
      universe: FO_STOCKS.length,
      scanned: 0,
      rows: [],
      source: "upstox",
      error:
        "UPSTOX_ACCESS_TOKEN missing. Add it to .env.local and restart the server.",
    };
    caches[side] = { at: now, data };
    return data;
  }

  try {
    const quotes = await fetchFoEquityQuotes(false, force);
    const rows: FoGainerRow[] = [];

    for (const meta of FO_STOCKS) {
      const q = quotes.get(meta.symbol);
      if (!q) continue;

      const price = Number(q.last_price ?? 0);
      if (!(price > 0)) continue;

      const changePct = equityChangePct(q);
      if (!Number.isFinite(changePct)) continue;
      if (side === "gainers" && !(changePct > 0)) continue;
      if (side === "losers" && !(changePct < 0)) continue;

      rows.push({
        symbol: meta.symbol,
        name: meta.name,
        sector: meta.sector,
        price,
        changePct,
      });
    }

    rows.sort((a, b) =>
      side === "gainers"
        ? b.changePct - a.changePct
        : a.changePct - b.changePct,
    );

    const data: FoGainersResponse = {
      updatedAt: new Date().toISOString(),
      marketStatus: getMarketStatus(),
      universe: FO_STOCKS.length,
      scanned: rows.length,
      rows,
      source: "upstox",
    };
    caches[side] = { at: now, data };
    return data;
  } catch (e) {
    const data: FoGainersResponse = {
      updatedAt: new Date().toISOString(),
      marketStatus: getMarketStatus(),
      universe: FO_STOCKS.length,
      scanned: 0,
      rows: [],
      source: "upstox",
      error: e instanceof Error ? e.message : `${label} failed`,
    };
    caches[side] = { at: now, data };
    return data;
  }
}

export function computeFoGainers(force = false): Promise<FoGainersResponse> {
  return computeFoMovers("gainers", force);
}

export function computeFoLosers(force = false): Promise<FoGainersResponse> {
  return computeFoMovers("losers", force);
}
