import { getMarketStatus } from "./marketHours";
import { detectOrderBlocks, todayCandles } from "./orderBlock";
import { computeRankings } from "./rankings";
import type { RankedStock, SectorFlow, Side } from "./types";
import { fetchIntraday5m, mapPool } from "./yahoo";

export interface FlowRow {
  symbol: string;
  name: string;
  sector: string;
  last: number;
  open: number;
  changePct: number;
  volume: number;
  strength: number;
  /** Rank on the Terminal strength board (1–20). */
  terminalRank: number;
  obConfirmed: boolean;
  /** Unix sec of the confirming candle; null if not confirmed. */
  confirmTime: number | null;
  rank: number;
  side: Side;
}

export interface FlowBoardResponse {
  updatedAt: string;
  marketStatus: ReturnType<typeof getMarketStatus>;
  scanned: number;
  /** Same all-F&O sector flow as Terminal. */
  sectors: SectorFlow[];
  bullish: FlowRow[];
  bearish: FlowRow[];
}

let cache: { at: number; data: FlowBoardResponse } | null = null;

function latestConfirmTime(
  candles: Parameters<typeof detectOrderBlocks>[0],
  side: Side,
): number | null {
  const zones = detectOrderBlocks(candles, side);
  const confirmed = zones.filter((z) => z.confirmed);
  if (!confirmed.length) return null;
  const current =
    confirmed.find((z) => z.isCurrent) ?? confirmed[confirmed.length - 1];
  return current.confirmTime ?? current.time;
}

function sortFlowRows(rows: FlowRow[]): FlowRow[] {
  return [...rows]
    .sort((a, b) => {
      if (a.obConfirmed !== b.obConfirmed) {
        return a.obConfirmed ? -1 : 1;
      }
      if (a.obConfirmed && b.obConfirmed) {
        return (b.confirmTime ?? 0) - (a.confirmTime ?? 0);
      }
      return a.terminalRank - b.terminalRank;
    })
    .map((row, i) => ({ ...row, rank: i + 1 }));
}

async function enrichSide(
  stocks: RankedStock[],
  side: Side,
): Promise<FlowRow[]> {
  const rows = (
    await mapPool(stocks, 10, async (stock) => {
      try {
        const m5 = await fetchIntraday5m(stock.symbol);
        const session = todayCandles(m5);
        const candles = session.length ? session : m5.slice(-80);
        const confirmTime = latestConfirmTime(candles, side);
        return {
          symbol: stock.symbol,
          name: stock.name,
          sector: stock.sector,
          last: stock.last,
          open: stock.open,
          changePct: stock.changePct,
          volume: stock.volume,
          strength: stock.strength,
          terminalRank: stock.rank,
          obConfirmed: confirmTime != null,
          confirmTime,
          rank: 0,
          side,
        } satisfies FlowRow;
      } catch {
        return {
          symbol: stock.symbol,
          name: stock.name,
          sector: stock.sector,
          last: stock.last,
          open: stock.open,
          changePct: stock.changePct,
          volume: stock.volume,
          strength: stock.strength,
          terminalRank: stock.rank,
          obConfirmed: false,
          confirmTime: null,
          rank: 0,
          side,
        } satisfies FlowRow;
      }
    })
  ).filter(Boolean) as FlowRow[];

  return sortFlowRows(rows);
}

/**
 * Flow board = Terminal's 20 bullish + 20 bearish, re-sorted by OB
 * confirmation time (confirmed first, newest confirmation first).
 */
export async function computeFlowBoard(
  force = false,
): Promise<FlowBoardResponse> {
  const now = Date.now();
  if (!force && cache && now - cache.at < 55_000) return cache.data;

  const rankings = await computeRankings(force);
  const [bullish, bearish] = await Promise.all([
    enrichSide(rankings.bullish, "bullish"),
    enrichSide(rankings.bearish, "bearish"),
  ]);

  const data: FlowBoardResponse = {
    updatedAt: new Date().toISOString(),
    marketStatus: getMarketStatus(),
    scanned: bullish.length + bearish.length,
    sectors: rankings.sectors,
    bullish,
    bearish,
  };

  cache = { at: now, data };
  return data;
}
