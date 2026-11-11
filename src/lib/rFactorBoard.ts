import {
  loadFoMarketSnapshot,
  type FoMarketSnapshot,
} from "./foMarketSnapshot";
import { getMarketStatus, getIstClock } from "./marketHours";
import {
  computeRFactorRaw,
  normalizeRScores,
  type RFactorComponents,
} from "./rFactor";
import { FO_STOCKS } from "./symbols";
import type { Candle } from "./types";
import type { EquityQuote } from "./upstox/equityQuotes";

export interface RFactorRow {
  symbol: string;
  name: string;
  sector: string;
  last: number;
  open: number;
  high: number;
  low: number;
  previousClose: number;
  changePct: number;
  volume: number;
  relVol: number;
  relRange: number;
  relMove: number;
  relAtr: number;
  /** Raw product before universe normalize. */
  rRaw: number;
  /** 0–100 vs max R_raw in universe. */
  rScore: number;
  rank: number;
}

export interface RFactorBoardResponse {
  updatedAt: string;
  marketStatus: ReturnType<typeof getMarketStatus>;
  universe: number;
  scored: number;
  rows: RFactorRow[];
  source?: "upstox";
  error?: string;
}

let cache: { at: number; data: RFactorBoardResponse } | null = null;
const CACHE_MS = 20_000;

function istDayOf(unixSec: number): string {
  return new Date(unixSec * 1000).toLocaleDateString("en-CA", {
    timeZone: "Asia/Kolkata",
  });
}

function todayVolumeFromDaily(daily: Candle[], istDate: string): number {
  for (let i = daily.length - 1; i >= 0; i--) {
    const c = daily[i];
    if (istDayOf(c.time) === istDate && c.volume > 0) return c.volume;
  }
  return 0;
}

function buildOne(
  meta: (typeof FO_STOCKS)[number],
  q: EquityQuote,
  daily: Candle[],
  istDate: string,
): Omit<RFactorRow, "rScore" | "rank"> | null {
  const open = Number(q.ohlc?.open ?? 0);
  const high = Number(q.ohlc?.high ?? 0);
  const low = Number(q.ohlc?.low ?? 0);
  const price = Number(q.last_price ?? 0);
  const quoteVol = Number(q.volume ?? 0);
  const candleVol = todayVolumeFromDaily(daily, istDate);
  const volume = quoteVol > 0 ? quoteVol : candleVol;
  const prev = Number(q.prev_close_price ?? q.ohlc?.close ?? 0);

  if (!(price > 0) || !(open > 0) || !(high > 0) || !(low > 0)) return null;
  if (!(high >= low)) return null;

  const priorDaily = daily.filter((c) => istDayOf(c.time) < istDate);
  const previousClose =
    prev > 0
      ? prev
      : priorDaily.length
        ? priorDaily[priorDaily.length - 1].close
        : open;

  const comps: RFactorComponents | null = computeRFactorRaw({
    open,
    high,
    low,
    last: price,
    volume,
    previousClose,
    priorDaily,
  });
  if (!comps) return null;

  const changePct =
    previousClose > 0 ? ((price - previousClose) / previousClose) * 100 : 0;

  return {
    symbol: meta.symbol,
    name: meta.name,
    sector: meta.sector,
    last: +price.toFixed(2),
    open: +open.toFixed(2),
    high: +high.toFixed(2),
    low: +low.toFixed(2),
    previousClose: +previousClose.toFixed(2),
    changePct: +changePct.toFixed(3),
    volume,
    relVol: +comps.relVol.toFixed(3),
    relRange: +comps.relRange.toFixed(5),
    relMove: +comps.relMove.toFixed(5),
    relAtr: +comps.relAtr.toFixed(3),
    rRaw: comps.rRaw,
  };
}

/**
 * R-factor board from shared Upstox quotes + daily candles
 * (same snapshot as Chartink — no per-symbol Yahoo crawl).
 */
export async function computeRFactorBoard(
  force = false,
  snapshot?: FoMarketSnapshot,
): Promise<RFactorBoardResponse> {
  const now = Date.now();
  if (!force && !snapshot && cache && now - cache.at < CACHE_MS) {
    return cache.data;
  }

  if (!process.env.UPSTOX_ACCESS_TOKEN?.trim()) {
    const data: RFactorBoardResponse = {
      updatedAt: new Date().toISOString(),
      marketStatus: getMarketStatus(),
      universe: FO_STOCKS.length,
      scored: 0,
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
    const snap = snapshot ?? (await loadFoMarketSnapshot(force));
    const { quotes, dailyMap, updatedAt } = snap;

    const partial: Array<Omit<RFactorRow, "rScore" | "rank">> = [];
    for (const meta of FO_STOCKS) {
      const q = quotes.get(meta.symbol);
      if (!q) continue;
      const row = buildOne(meta, q, dailyMap.get(meta.symbol) ?? [], istDate);
      if (row) partial.push(row);
    }

    const scores = normalizeRScores(partial.map((r) => r.rRaw));
    const rows: RFactorRow[] = partial
      .map((r, i) => ({
        ...r,
        rScore: scores[i] ?? 0,
        rank: 0,
      }))
      .filter((r) => r.rScore > 0)
      .sort((a, b) => b.rScore - a.rScore || b.relVol - a.relVol)
      .map((r, i) => ({ ...r, rank: i + 1 }));

    const data: RFactorBoardResponse = {
      updatedAt,
      marketStatus: getMarketStatus(),
      universe: FO_STOCKS.length,
      scored: rows.length,
      rows,
      source: "upstox",
    };
    cache = { at: now, data };
    return data;
  } catch (e) {
    const data: RFactorBoardResponse = {
      updatedAt: new Date().toISOString(),
      marketStatus: getMarketStatus(),
      universe: FO_STOCKS.length,
      scored: 0,
      rows: [],
      source: "upstox",
      error: e instanceof Error ? e.message : "R-factor board failed",
    };
    cache = { at: now, data };
    return data;
  }
}
