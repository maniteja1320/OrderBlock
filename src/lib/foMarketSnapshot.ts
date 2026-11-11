import type { Candle } from "./types";
import { loadFoEquityDailyCandles } from "./upstox/equityCandles";
import {
  fetchFoEquityQuotes,
  type EquityQuote,
} from "./upstox/equityQuotes";

/**
 * Shared Upstox F&O cash snapshot: one quotes pull + one daily-candle load.
 * Chartink + TradeFinder both consume this so tabs don't re-hit Upstox.
 */

export interface FoMarketSnapshot {
  updatedAt: string;
  quotes: Map<string, EquityQuote>;
  dailyMap: Map<string, Candle[]>;
}

let cache: { at: number; data: FoMarketSnapshot } | null = null;
let inflight: Promise<FoMarketSnapshot> | null = null;
const CACHE_MS = 20_000;

export async function loadFoMarketSnapshot(
  force = false,
): Promise<FoMarketSnapshot> {
  const now = Date.now();
  if (!force && cache && now - cache.at < CACHE_MS) {
    return cache.data;
  }
  // Always coalesce concurrent loads (including force) so Chartink + TradeFinder
  // never open two Upstox crawls in parallel.
  if (inflight) return inflight;

  const run = (async (): Promise<FoMarketSnapshot> => {
    const [quotes, dailyMap] = await Promise.all([
      fetchFoEquityQuotes(false, force),
      loadFoEquityDailyCandles({ force, concurrency: 4 }),
    ]);
    const data: FoMarketSnapshot = {
      updatedAt: new Date().toISOString(),
      quotes,
      dailyMap,
    };
    cache = { at: Date.now(), data };
    return data;
  })();

  inflight = run;
  try {
    return await run;
  } finally {
    if (inflight === run) inflight = null;
  }
}
