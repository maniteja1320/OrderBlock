import {
  classifyBuildUp,
  computeConviction,
  computeRiskReward,
  computeVwap,
  pctVsVwap,
} from "./analytics";
import { getMarketStatus } from "./marketHours";
import { fetchFuturesOi } from "./nseOi";
import { detectOrderBlocks, buildLevels, todayCandles } from "./orderBlock";
import { analyzeSmartMoney } from "./smartMoney";
import { averageDailyMove, buildQuote } from "./strength";
import { FO_STOCKS, symbolMap } from "./symbols";
import type {
  RankedStock,
  RankingsResponse,
  SectorFlow,
  Side,
  SmartMoneyDetail,
  SmartMoneyScanRow,
  StockDetail,
  StockPopupStats,
  StockQuote,
} from "./types";
import {
  fetchDaily,
  fetchIntraday1m,
  fetchIntraday5m,
  mapPool,
} from "./yahoo";

const avgMoveCache = new Map<string, { value: number; day: string }>();
let prevRanks = new Map<string, number>();
let rankingsCache: { at: number; data: RankingsResponse } | null = null;

export function getSymbolBoardContext(symbol: string): {
  rank: number;
  boardSize: number;
  percentile: number;
  isPick: boolean;
  boardSide: Side;
} | null {
  const data = rankingsCache?.data;
  if (!data) return null;
  const sym = symbol.toUpperCase();
  const bullIdx = data.bullish.findIndex((s) => s.symbol === sym);
  if (bullIdx >= 0) {
    const boardSize = data.bullish.length;
    const rank = bullIdx + 1;
    return {
      rank,
      boardSize,
      percentile: boardSize
        ? Math.round((1 - (rank - 1) / boardSize) * 1000) / 10
        : 0,
      isPick: data.topPicks.some(
        (p) => p.symbol === sym && p.side === "bullish",
      ),
      boardSide: "bullish",
    };
  }
  const bearIdx = data.bearish.findIndex((s) => s.symbol === sym);
  if (bearIdx >= 0) {
    const boardSize = data.bearish.length;
    const rank = bearIdx + 1;
    return {
      rank,
      boardSize,
      percentile: boardSize
        ? Math.round((1 - (rank - 1) / boardSize) * 1000) / 10
        : 0,
      isPick: data.topPicks.some(
        (p) => p.symbol === sym && p.side === "bearish",
      ),
      boardSide: "bearish",
    };
  }
  return null;
}

function istDayKey() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

async function getAvgDailyMove(symbol: string): Promise<number> {
  const day = istDayKey();
  const hit = avgMoveCache.get(symbol);
  if (hit && hit.day === day) return hit.value;

  const daily = await fetchDaily(symbol);
  const value = averageDailyMove(daily, 50);
  avgMoveCache.set(symbol, { value, day });
  return value;
}

async function fetchQuote(meta: (typeof FO_STOCKS)[number]): Promise<StockQuote | null> {
  try {
    const [{ candles, previousClose, last }, avgDailyMove] = await Promise.all([
      fetchIntraday1m(meta.symbol),
      getAvgDailyMove(meta.symbol),
    ]);
    return buildQuote(meta, candles, previousClose, last, avgDailyMove);
  } catch {
    return null;
  }
}

function sectorFlows(quotes: StockQuote[]): SectorFlow[] {
  const map = new Map<string, { sum: number; count: number; bull: number; bear: number }>();
  for (const q of quotes) {
    const cur = map.get(q.sector) ?? { sum: 0, count: 0, bull: 0, bear: 0 };
    const signed =
      q.side === "bullish" ? q.strength : q.side === "bearish" ? -q.strength : 0;
    cur.sum += signed;
    cur.count += 1;
    if (q.side === "bullish") cur.bull += 1;
    if (q.side === "bearish") cur.bear += 1;
    map.set(q.sector, cur);
  }

  return [...map.entries()]
    .map(([sector, v]) => {
      const avgStrength = v.count ? v.sum / v.count : 0;
      const netSide: Side | "neutral" =
        avgStrength > 0.02 ? "bullish" : avgStrength < -0.02 ? "bearish" : "neutral";
      return {
        sector,
        avgStrength,
        count: v.count,
        bullishCount: v.bull,
        bearishCount: v.bear,
        netSide,
      };
    })
    .sort((a, b) => b.avgStrength - a.avgStrength);
}

function toRanked(list: StockQuote[], side: Side): RankedStock[] {
  const sorted = list
    .filter((q) => q.side === side && q.strength > 0)
    .sort((a, b) => b.strength - a.strength)
    .slice(0, 20);

  return sorted.map((q, i) => {
    const rank = i + 1;
    const prev = prevRanks.get(`${side}:${q.symbol}`);
    const rankChange = prev != null ? prev - rank : 0;
    return {
      ...q,
      rank,
      rankChange,
      score: q.strength,
    };
  });
}

export async function computeRankings(force = false): Promise<RankingsResponse> {
  const now = Date.now();
  if (!force && rankingsCache && now - rankingsCache.at < 55_000) {
    return rankingsCache.data;
  }

  const quotes = (
    await mapPool(FO_STOCKS, 20, async (meta) => fetchQuote(meta))
  ).filter((q): q is StockQuote => Boolean(q));

  const bullish = toRanked(quotes, "bullish");
  const bearish = toRanked(quotes, "bearish");

  const nextPrev = new Map<string, number>();
  for (const s of bullish) nextPrev.set(`bullish:${s.symbol}`, s.rank);
  for (const s of bearish) nextPrev.set(`bearish:${s.symbol}`, s.rank);
  prevRanks = nextPrev;

  const sectors = sectorFlows(quotes);
  const breadth = {
    up: quotes.filter((q) => q.changePct > 0.05).length,
    down: quotes.filter((q) => q.changePct < -0.05).length,
    flat: quotes.filter((q) => Math.abs(q.changePct) <= 0.05).length,
    total: quotes.length,
  };

  const topPicks = [
    ...bullish.slice(0, 3),
    ...bearish.slice(0, 3),
  ];

  const data: RankingsResponse = {
    updatedAt: new Date().toISOString(),
    marketStatus: getMarketStatus(),
    bullish,
    bearish,
    topPicks,
    all: quotes.map((q) => ({
      symbol: q.symbol,
      changePct: q.changePct,
      strength: q.strength,
      side: q.side,
      sector: q.sector,
    })),
    sectors,
    breadth,
    leadingSector: sectors[0] ?? null,
    laggingSector: sectors[sectors.length - 1] ?? null,
  };

  rankingsCache = { at: now, data };
  return data;
}

export async function getStockDetail(symbol: string): Promise<StockDetail | null> {
  const meta = symbolMap.get(symbol.toUpperCase());
  if (!meta) return null;

  // Load chart data first; OI is optional and must never block the popup
  const [{ candles: m1, previousClose, last }, avgDailyMove, m5] =
    await Promise.all([
      fetchIntraday1m(meta.symbol),
      getAvgDailyMove(meta.symbol),
      fetchIntraday5m(meta.symbol),
    ]);

  const oi = await Promise.race([
    fetchFuturesOi(meta.symbol),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 1600)),
  ]);

  const quote = buildQuote(meta, m1, previousClose, last, avgDailyMove);
  if (!quote) return null;

  const side: Side = quote.side === "neutral"
    ? quote.changePct >= 0
      ? "bullish"
      : "bearish"
    : quote.side;

  const session = todayCandles(m5);
  const candles = session.length ? session : m5.slice(-80);
  const zones = detectOrderBlocks(session.length ? session : m5, side);
  const current =
    zones.find((z) => z.confirmed && z.isCurrent) ??
    zones.filter((z) => z.confirmed).at(-1) ??
    zones.find((z) => z.isCurrent) ??
    zones.at(-1);
  const levelCandles = session.length ? session : m5;
  const levels = buildLevels(current, levelCandles, side, zones);

  const vwapCandles = todayCandles(m1).length ? todayCandles(m1) : m1;
  const vwap = computeVwap(vwapCandles.length ? vwapCandles : candles);
  const rr = computeRiskReward(current?.confirmed ? current : undefined, levels, side);
  const board = getSymbolBoardContext(meta.symbol);
  const oiChangePct = oi?.oiChangePct ?? null;
  const buildUp = classifyBuildUp(quote.changePct, oiChangePct);

  const boardSide = board?.boardSide ?? side;
  const isPick = board?.isPick ?? false;
  let rule = "—";
  if (board) {
    rule = isPick
      ? `PICK · ${board.boardSide.toUpperCase()} #${board.rank}`
      : board.rank <= 3
        ? "NOT PICKED · sector cap"
        : "NOT PICKED · outside top 3";
  }

  const stats: StockPopupStats = {
    vwap,
    pctAboveVwap: pctVsVwap(quote.last, vwap),
    oi: oi?.openInterest ?? null,
    oiChangePct,
    buildUp,
    riskReward: rr?.label ?? null,
    riskRewardRatio: rr?.ratio ?? null,
    conviction: computeConviction(quote.strength),
    rank: board?.rank ?? null,
    boardSize: board?.boardSize ?? null,
    percentile: board?.percentile ?? null,
    isPick,
    boardSide,
    rule,
  };

  const sm = analyzeSmartMoney(candles);
  const smartMoney: SmartMoneyDetail = {
    cvd: sm.cvd,
    lastDelta: sm.lastDelta,
    divergence: sm.divergence,
    relativeVolume: sm.relativeVolume,
    bigPrintCount: sm.bigPrintCount,
    absorptionCount: sm.absorptionCount,
    score: sm.score,
    bias: sm.bias,
    note: sm.note,
    profile: sm.profile
      ? {
          poc: sm.profile.poc,
          vah: sm.profile.vah,
          val: sm.profile.val,
          totalVolume: sm.profile.totalVolume,
          bins: sm.profile.bins,
        }
      : null,
    bars: sm.bars.map((b) => ({
      time: b.time,
      volume: b.volume,
      delta: b.delta,
      cvd: b.cvd,
      absorption: b.absorption,
      bigPrint: b.bigPrint,
    })),
  };

  return {
    quote,
    candles,
    zones,
    levels,
    stats,
    smartMoney,
  };
}

let smartMoneyCache: { at: number; rows: SmartMoneyScanRow[] } | null = null;

/**
 * Smart-money scanner over current strength boards (faster than full F&O).
 * Uses 5m OHLC proxies — not tick footprint / true CVD.
 */
export async function computeSmartMoneyScan(
  force = false,
): Promise<{ updatedAt: string; rows: SmartMoneyScanRow[] }> {
  const now = Date.now();
  if (!force && smartMoneyCache && now - smartMoneyCache.at < 55_000) {
    return {
      updatedAt: new Date(smartMoneyCache.at).toISOString(),
      rows: smartMoneyCache.rows,
    };
  }

  const rankings = await computeRankings(force);
  const board = [...rankings.bullish, ...rankings.bearish];
  const seen = new Set<string>();
  const metas = board
    .map((r) => symbolMap.get(r.symbol))
    .filter((m): m is (typeof FO_STOCKS)[number] => {
      if (!m || seen.has(m.symbol)) return false;
      seen.add(m.symbol);
      return true;
    });

  const rows = (
    await mapPool(metas, 10, async (meta) => {
      try {
        const m5 = await fetchIntraday5m(meta.symbol);
        const session = todayCandles(m5);
        const candles = session.length ? session : m5.slice(-80);
        const sm = analyzeSmartMoney(candles);
        const quote = board.find((b) => b.symbol === meta.symbol);
        return {
          symbol: meta.symbol,
          name: meta.name,
          sector: meta.sector,
          changePct: quote?.changePct ?? 0,
          strength: quote?.strength ?? 0,
          side: quote?.side ?? "neutral",
          score: sm.score,
          bias: sm.bias,
          cvd: sm.cvd,
          relativeVolume: sm.relativeVolume,
          bigPrintCount: sm.bigPrintCount,
          absorptionCount: sm.absorptionCount,
          divergence: sm.divergence,
          poc: sm.profile?.poc ?? null,
          note: sm.note,
        } satisfies SmartMoneyScanRow;
      } catch {
        return null;
      }
    })
  )
    .filter((r): r is SmartMoneyScanRow => Boolean(r))
    .sort((a, b) => b.score - a.score);

  smartMoneyCache = { at: now, rows };
  return { updatedAt: new Date(now).toISOString(), rows };
}
