import type { BullVsBearResponse } from "./bullVsBearTypes";
import type { ChartinkBoardResponse } from "./chartinkBoardTypes";
import type { FoGainerRow, FoGainersResponse } from "./foGainersTypes";
import { getIstClock, getMarketStatus } from "./marketHours";
import type { NarrowCprResponse, NarrowCprRow } from "./narrowCprTypes";
import type {
  Near52WeekHighResponse,
  Near52WeekHighRow,
} from "./near52WeekHighTypes";
import type {
  OiOptionsStockRow,
  OiOptionsStocksResponse,
} from "./oiOptionsStocksTypes";
import {
  loadFoMarketSnapshot,
  type FoMarketSnapshot,
} from "./foMarketSnapshot";
import { FO_STOCKS } from "./symbols";
import type { Candle } from "./types";
import { avgVolume20d } from "./upstox/equityCandles";
import {
  equityChangePct,
  type EquityQuote,
} from "./upstox/equityQuotes";
import type {
  VolumeIncreaseResponse,
  VolumeIncreaseRow,
} from "./volumeIncreaseTypes";

export type { ChartinkBoardResponse } from "./chartinkBoardTypes";

let boardCache: { at: number; data: ChartinkBoardResponse } | null = null;
const BOARD_CACHE_MS = 20_000;

function emptyTokenError(msg: string) {
  return {
    updatedAt: new Date().toISOString(),
    marketStatus: getMarketStatus(),
    universe: FO_STOCKS.length,
    scanned: 0,
    source: "upstox" as const,
    error: msg,
  };
}

function buildBullVsBear(quotes: Map<string, EquityQuote>): BullVsBearResponse {
  let bull = 0;
  let bear = 0;
  let flat = 0;
  let scanned = 0;
  for (const meta of FO_STOCKS) {
    const q = quotes.get(meta.symbol);
    if (!q) continue;
    const last = Number(q.last_price ?? 0);
    const prev = Number(q.prev_close_price ?? q.ohlc?.close ?? 0);
    if (!(last > 0) || !(prev > 0)) continue;
    scanned += 1;
    if (last > prev) bull += 1;
    else if (last < prev) bear += 1;
    else flat += 1;
  }
  const decided = bull + bear;
  return {
    updatedAt: new Date().toISOString(),
    marketStatus: getMarketStatus(),
    universe: FO_STOCKS.length,
    scanned,
    bull,
    bear,
    flat,
    net: bull - bear,
    bullPct: decided ? (bull / decided) * 100 : 50,
    source: "upstox",
  };
}

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

function buildVolumeIncrease(
  quotes: Map<string, EquityQuote>,
  dailyMap: Map<string, Candle[]>,
  istDate: string,
): VolumeIncreaseResponse {
  const rows: VolumeIncreaseRow[] = [];
  for (const meta of FO_STOCKS) {
    const daily = dailyMap.get(meta.symbol);
    if (!daily?.length) continue;
    const sma20 = avgVolume20d(daily, istDate);
    if (sma20 == null || !(sma20 > 0)) continue;
    const q = quotes.get(meta.symbol);
    const quoteVol = Number(q?.volume ?? 0);
    const candleVol = todayVolumeFromDaily(daily, istDate) ?? 0;
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
  return {
    updatedAt: new Date().toISOString(),
    marketStatus: getMarketStatus(),
    universe: FO_STOCKS.length,
    scanned: rows.length,
    rows,
    source: "upstox",
  };
}

function buildOiOptions(
  quotes: Map<string, EquityQuote>,
): OiOptionsStocksResponse {
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
  return {
    updatedAt: new Date().toISOString(),
    marketStatus: getMarketStatus(),
    universe: FO_STOCKS.length,
    scanned: rows.length,
    rows,
    source: "upstox",
  };
}

function buildMovers(
  quotes: Map<string, EquityQuote>,
  side: "gainers" | "losers",
): FoGainersResponse {
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
    side === "gainers" ? b.changePct - a.changePct : a.changePct - b.changePct,
  );
  return {
    updatedAt: new Date().toISOString(),
    marketStatus: getMarketStatus(),
    universe: FO_STOCKS.length,
    scanned: rows.length,
    rows,
    source: "upstox",
  };
}

function priorDayBar(daily: Candle[], istDate: string): Candle | null {
  for (let i = daily.length - 1; i >= 0; i--) {
    const c = daily[i];
    const d = new Date(c.time * 1000).toLocaleDateString("en-CA", {
      timeZone: "Asia/Kolkata",
    });
    if (d !== istDate && c.high > 0 && c.low > 0 && c.close > 0) return c;
  }
  return null;
}

function cprWidthPct(high: number, low: number, close: number): number | null {
  if (!(high > 0 && low > 0 && close > 0) || high < low) return null;
  const pivot = (high + low + close) / 3;
  const bc = (high + low) / 2;
  const tc = 2 * pivot - bc;
  if (!(pivot > 0)) return null;
  return (Math.abs(tc - bc) / pivot) * 100;
}

function buildNarrowCpr(
  quotes: Map<string, EquityQuote>,
  dailyMap: Map<string, Candle[]>,
  istDate: string,
): NarrowCprResponse {
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
  return {
    updatedAt: new Date().toISOString(),
    marketStatus: getMarketStatus(),
    universe: FO_STOCKS.length,
    scanned: rows.length,
    rows,
    source: "upstox",
  };
}

function buildNear52(quotes: Map<string, EquityQuote>): Near52WeekHighResponse {
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
  rows.sort((a, b) => b.pctHigh - a.pctHigh || b.changePct - a.changePct);
  return {
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
}

function emptyBoard(msg: string): ChartinkBoardResponse {
  const base = emptyTokenError(msg);
  return {
    updatedAt: new Date().toISOString(),
    bullVsBear: {
      ...base,
      bull: 0,
      bear: 0,
      flat: 0,
      net: 0,
      bullPct: 50,
      source: "upstox",
    },
    volumeIncrease: { ...base, rows: [] },
    oiOptionsStocks: { ...base, rows: [] },
    foGainers: { ...base, rows: [] },
    foLosers: { ...base, rows: [] },
    narrowCpr: { ...base, rows: [] },
    near52WeekHigh: { ...base, rows: [] },
    error: msg,
  };
}

/**
 * Chartink dashboards from the shared Upstox F&O snapshot
 * (same quotes + daily candles as TradeFinder).
 */
export async function computeChartinkBoard(
  force = false,
  snapshot?: FoMarketSnapshot,
): Promise<ChartinkBoardResponse> {
  const now = Date.now();
  if (!force && !snapshot && boardCache && now - boardCache.at < BOARD_CACHE_MS) {
    return boardCache.data;
  }

  const tokenMissing = !process.env.UPSTOX_ACCESS_TOKEN?.trim();
  if (tokenMissing) {
    const data = emptyBoard(
      "UPSTOX_ACCESS_TOKEN missing. Add it to .env.local and restart the server.",
    );
    boardCache = { at: now, data };
    return data;
  }

  try {
    const istDate = getIstClock().date;
    const snap = snapshot ?? (await loadFoMarketSnapshot(force));
    const { quotes, dailyMap, updatedAt } = snap;

    const data: ChartinkBoardResponse = {
      updatedAt,
      bullVsBear: buildBullVsBear(quotes),
      volumeIncrease: buildVolumeIncrease(quotes, dailyMap, istDate),
      oiOptionsStocks: buildOiOptions(quotes),
      foGainers: buildMovers(quotes, "gainers"),
      foLosers: buildMovers(quotes, "losers"),
      narrowCpr: buildNarrowCpr(quotes, dailyMap, istDate),
      near52WeekHigh: buildNear52(quotes),
    };
    boardCache = { at: now, data };
    return data;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Chartink board failed";
    const data = emptyBoard(msg);
    boardCache = { at: now, data };
    return data;
  }
}
