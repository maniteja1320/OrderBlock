import { classifyBuildUp, type BuildUp } from "./analytics";
import { getIstClock, getMarketStatus } from "./marketHours";
import {
  averageDailyMove,
  computeStrengthFromSession,
} from "./strength";
import { FO_STOCKS, symbolMap } from "./symbols";
import {
  fetchFuturesQuotes,
  fetchSessionOpenOi,
  loadNearestFutures,
  resolveQuoteForContract,
  seedSessionOpenOi,
} from "./upstox";
import { loadFoEquityDailyCandles } from "./upstox/equityCandles";

export interface OiBuildUpRow {
  symbol: string;
  name: string;
  sector: string;
  instrumentKey: string;
  tradingSymbol: string;
  last: number;
  open: number;
  /** Session price % vs prev close / open (Upstox futures quote). */
  changePct: number;
  terminalStrength: number;
  terminalRank: number;
  oi: number;
  /** Session-open OI baseline (Option 2). */
  openOi: number | null;
  /** OI % vs session-open OI. */
  oiChangePct: number | null;
  oiChange: number | null;
  oiSource: "upstox" | "none";
  buildUp: BuildUp;
  /** Liquidity score: strength × (1 + OI%/100). Choppy (strength 0) → 0. */
  score: number;
  rank: number;
  rankChange: number;
}

export interface OiBuildUpBoardResponse {
  updatedAt: string;
  marketStatus: ReturnType<typeof getMarketStatus>;
  source: "upstox";
  universe: number;
  matchedFutures: number;
  quoted: number;
  bullish: OiBuildUpRow[];
  bearish: OiBuildUpRow[];
  error?: string;
}

let cache: { at: number; data: OiBuildUpBoardResponse } | null = null;
let prevRanks = new Map<string, number>();
const BOARD_CACHE_MS = 20_000;

function withRanks(
  side: "bullish" | "bearish",
  rows: OiBuildUpRow[],
): OiBuildUpRow[] {
  return rows.map((r, i) => {
    const rank = i + 1;
    const prev = prevRanks.get(`${side}:${r.symbol}`);
    return {
      ...r,
      rank,
      rankChange: prev != null ? prev - rank : 0,
    };
  });
}

/**
 * Order-block Smart Money / liquidity style:
 * OI build-up qualifies the name; strength ranks it (choppy = 0).
 * score = strength × (1 + max(0, oiChangePct) / 100)
 */
function liquidityScore(strength: number, oiChangePct: number | null): number {
  if (strength <= 0) return 0;
  const oi = Math.max(0, oiChangePct ?? 0);
  return strength * (1 + oi / 100);
}

function compareLiquidity(a: OiBuildUpRow, b: OiBuildUpRow) {
  return (
    b.score - a.score ||
    (b.oiChangePct ?? -Infinity) - (a.oiChangePct ?? -Infinity) ||
    Math.abs(b.changePct) - Math.abs(a.changePct)
  );
}

/**
 * Day % vs previous close. Never treat session ohlc.close as prev close —
 * after the open that field tracks today's close ≈ LTP, which zeros change%.
 */
function changePctFromQuote(
  last: number,
  open: number,
  prevClose: number,
  netChange?: number,
): number {
  if (prevClose > 0 && Number.isFinite(last) && last > 0) {
    return ((last - prevClose) / prevClose) * 100;
  }
  if (
    netChange != null &&
    Number.isFinite(netChange) &&
    last > 0 &&
    last !== netChange
  ) {
    const prev = last - netChange;
    if (prev > 0) return (netChange / prev) * 100;
  }
  // Last resort only (intraday vs open) — not ideal for day-side labels.
  if (open > 0 && Number.isFinite(last)) {
    return ((last - open) / open) * 100;
  }
  return 0;
}

/**
 * Market Data OI build-up board — Upstox only.
 * Futures quotes + session-open OI + equity daily (avg range for strength).
 * No Yahoo Terminal rankings crawl.
 */
export async function computeOiBuildUpBoard(
  force = false,
): Promise<OiBuildUpBoardResponse> {
  const now = Date.now();
  if (!force && cache && now - cache.at < BOARD_CACHE_MS) {
    return cache.data;
  }

  if (!process.env.UPSTOX_ACCESS_TOKEN?.trim()) {
    const empty: OiBuildUpBoardResponse = {
      updatedAt: new Date().toISOString(),
      marketStatus: getMarketStatus(),
      source: "upstox",
      universe: FO_STOCKS.length,
      matchedFutures: 0,
      quoted: 0,
      bullish: [],
      bearish: [],
      error:
        "UPSTOX_ACCESS_TOKEN missing. Add it to .env.local (see .env.example) and restart the server.",
    };
    return empty;
  }

  try {
    // Instruments + daily candles in parallel (daily usually disk-hit after Chartink).
    const [futuresAll, dailyMap] = await Promise.all([
      loadNearestFutures(false),
      loadFoEquityDailyCandles({
        force: false,
        concurrency: 4,
        // Prefer disk for live board; backfill missing without blocking on force.
        diskOnly: false,
      }),
    ]);

    const contracts = [...futuresAll.values()];
    const futures = new Map(contracts.map((c) => [c.symbol, c]));

    const [quotes, openOiMap] = await Promise.all([
      contracts.length > 0
        ? fetchFuturesQuotes(
            contracts.map((c) => c.instrumentKey),
            force,
          )
        : Promise.resolve(new Map()),
      contracts.length > 0
        ? fetchSessionOpenOi(contracts, force, {
            // Warm gradually; disk/memory fills across refreshes.
            maxFetch: force ? 60 : 30,
          })
        : Promise.resolve(new Map()),
    ]);

    const ist = getIstClock();
    const mins = ist.hour * 60 + ist.minute;
    const earlySession = mins >= 9 * 60 + 15 && mins < 9 * 60 + 30;

    const rows: OiBuildUpRow[] = [];
    for (const meta of FO_STOCKS) {
      const contract = futures.get(meta.symbol);
      if (!contract) continue;
      const q = resolveQuoteForContract(quotes, contract);
      if (!q) continue;

      const last = Number(q.last_price ?? 0);
      const open = Number(q.ohlc?.open ?? 0);
      const high = Number(q.ohlc?.high ?? 0);
      const low = Number(q.ohlc?.low ?? 0);
      // prev_close_price when present; never ohlc.close (that is session close).
      const prevClose = Number(q.prev_close_price ?? 0);
      const oi = Number(q.oi ?? 0);
      if (!last || !Number.isFinite(last)) continue;

      const changePct = changePctFromQuote(last, open, prevClose, q.net_change);

      const daily = dailyMap.get(meta.symbol) ?? [];
      const avgMove = averageDailyMove(daily, 50);
      const { strength } = computeStrengthFromSession(
        open > 0 ? open : last,
        high > 0 ? high : last,
        low > 0 ? low : last,
        last,
        avgMove,
      );

      let oiChangePct: number | null = null;
      let oiChange: number | null = null;
      let oiSource: OiBuildUpRow["oiSource"] = "none";

      let openOi = openOiMap.get(meta.symbol) ?? null;
      // First ~15m: if candle baseline missing, seed once from live quote.
      if (openOi == null && earlySession && Number.isFinite(oi) && oi > 0) {
        seedSessionOpenOi(meta.symbol, oi);
        openOi = oi;
      }

      if (openOi != null && openOi > 0 && Number.isFinite(oi) && oi > 0) {
        oiChange = oi - openOi;
        oiChangePct = (oiChange / openOi) * 100;
        oiSource = "upstox";
      }

      const stock = symbolMap.get(meta.symbol) ?? meta;
      const intradayPct =
        open > 0 && Number.isFinite(last) ? ((last - open) / open) * 100 : null;
      const buildUp = classifyBuildUp(changePct, oiChangePct, intradayPct);
      rows.push({
        symbol: meta.symbol,
        name: stock.name,
        sector: stock.sector,
        instrumentKey: contract.instrumentKey,
        tradingSymbol: contract.tradingSymbol,
        last,
        open,
        changePct: +changePct.toFixed(3),
        terminalStrength: strength,
        terminalRank: 0,
        oi,
        openOi,
        oiChangePct: oiChangePct == null ? null : +oiChangePct.toFixed(2),
        oiChange,
        oiSource,
        buildUp,
        score: +liquidityScore(strength, oiChangePct).toFixed(4),
        rank: 0,
        rankChange: 0,
      });
    }

    // Same idea as order-block.com/app/smart-money (Liquidity board):
    // only true OI build-up, choppy (score 0) out, strongest liquidity score first, top 20.
    const bullish = withRanks(
      "bullish",
      rows
        .filter((r) => r.buildUp === "LONG BUILD-UP" && r.score > 0)
        .sort(compareLiquidity)
        .slice(0, 20),
    );
    const bearish = withRanks(
      "bearish",
      rows
        .filter((r) => r.buildUp === "SHORT BUILD-UP" && r.score > 0)
        .sort(compareLiquidity)
        .slice(0, 20),
    );

    const nextPrev = new Map<string, number>();
    for (const r of bullish) nextPrev.set(`bullish:${r.symbol}`, r.rank);
    for (const r of bearish) nextPrev.set(`bearish:${r.symbol}`, r.rank);
    prevRanks = nextPrev;

    const data: OiBuildUpBoardResponse = {
      updatedAt: new Date().toISOString(),
      marketStatus: getMarketStatus(),
      source: "upstox",
      universe: FO_STOCKS.length,
      matchedFutures: futures.size,
      quoted: rows.length,
      bullish,
      bearish,
    };

    cache = { at: now, data };
    return data;
  } catch (e) {
    const data: OiBuildUpBoardResponse = {
      updatedAt: new Date().toISOString(),
      marketStatus: getMarketStatus(),
      source: "upstox",
      universe: FO_STOCKS.length,
      matchedFutures: 0,
      quoted: 0,
      bullish: [],
      bearish: [],
      error: e instanceof Error ? e.message : "OI build-up board failed",
    };
    cache = { at: now, data };
    return data;
  }
}
