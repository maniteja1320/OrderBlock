import { getMarketStatus, getIstClock } from "./marketHours";
import { FO_STOCKS } from "./symbols";
import type { Candle } from "./types";
import {
  avgVolume20d,
  loadFoEquityDailyCandles,
} from "./upstox/equityCandles";
import { fetchFoEquityQuotes } from "./upstox/equityQuotes";
import type {
  VolumeIncreaseResponse,
  VolumeIncreaseRow,
} from "./volumeIncreaseTypes";

export type { VolumeIncreaseResponse, VolumeIncreaseRow } from "./volumeIncreaseTypes";

/**
 * Chartink:
 *   Daily Volume - 1 day ago Sma ( Daily Volume , 20 )
 *     / 1 day ago Sma ( Daily Volume , 20 ) * 100 as 'Column1'
 *
 * = (today volume − SMA20 as of yesterday) / SMA20_yesterday × 100
 * Universe = 213 F&O cash underlyings.
 */

let cache: { at: number; data: VolumeIncreaseResponse } | null = null;
const CACHE_MS = 60_000;

function todayVolumeFromDaily(
  daily: Candle[],
  istDate: string,
): number | null {
  for (let i = daily.length - 1; i >= 0; i--) {
    const c = daily[i];
    const d = new Date(c.time * 1000).toLocaleDateString("en-CA", {
      timeZone: "Asia/Kolkata",
    });
    if (d === istDate && c.volume > 0) return c.volume;
  }
  return null;
}

export async function computeVolumeIncrease(
  force = false,
): Promise<VolumeIncreaseResponse> {
  const now = Date.now();
  if (!force && cache && now - cache.at < CACHE_MS) {
    return cache.data;
  }

  if (!process.env.UPSTOX_ACCESS_TOKEN?.trim()) {
    const data: VolumeIncreaseResponse = {
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

    const rows: VolumeIncreaseRow[] = [];
    for (const meta of FO_STOCKS) {
      const daily = dailyMap.get(meta.symbol);
      if (!daily?.length) continue;

      const sma20 = avgVolume20d(daily, istDate);
      if (sma20 == null || !(sma20 > 0)) continue;

      const q = quotes.get(meta.symbol);
      const quoteVol = Number(q?.volume ?? 0);
      const candleVol = todayVolumeFromDaily(daily, istDate) ?? 0;
      // Prefer live session volume; fall back to today's daily bar.
      const volume = quoteVol > 0 ? quoteVol : candleVol;
      if (!(volume > 0)) continue;

      const increasePct = ((volume - sma20) / sma20) * 100;
      if (!Number.isFinite(increasePct)) continue;

      rows.push({
        symbol: meta.symbol,
        name: meta.name,
        sector: meta.sector,
        volume,
        sma20,
        increasePct,
      });
    }

    rows.sort((a, b) => b.increasePct - a.increasePct);

    const data: VolumeIncreaseResponse = {
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
    const data: VolumeIncreaseResponse = {
      updatedAt: new Date().toISOString(),
      marketStatus: getMarketStatus(),
      universe: FO_STOCKS.length,
      scanned: 0,
      rows: [],
      source: "upstox",
      error:
        e instanceof Error ? e.message : "Daily volume increase scan failed",
    };
    cache = { at: now, data };
    return data;
  }
}
