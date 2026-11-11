import { detectFairValueGaps } from "../fvg";
import { deriveHypoFields, median } from "../hypoFeatures";
import { getIstClock } from "../marketHours";
import {
  addPeerSector,
  inferHypoSide,
  type RefinedStockInput,
} from "../scanner/refinedScore";
import { FO_STOCKS, symbolMap } from "../symbols";
import {
  avgVolume20d,
  loadFoEquityDailyCandles,
  loadFoEquityIntradayCandles,
  type IntradayInterval,
} from "../upstox/equityCandles";
import {
  equityChangePct,
  fetchFoEquityQuotes,
  type EquityQuote,
} from "../upstox/equityQuotes";
import type { Candle } from "../types";

export interface UniverseRow extends RefinedStockInput {
  name: string;
  sector: string;
  last: number;
  prevClose: number;
  vol_ratio: number | null;
  structureTime: string | null;
  timeframe: IntradayInterval;
  lookback: number;
}

export interface UniverseSnapshot {
  sessionDate: string;
  timeframe: IntradayInterval;
  lookback: number;
  asOfLabel: string;
  quoted: number;
  rows: UniverseRow[];
}

function distPct(last: number, level: number | null | undefined): number | null {
  if (!last || !level || level <= 0) return null;
  return (Math.abs(level - last) / level) * 100;
}

function sessionAsOfUnix(sessionDate: string, hhmm: string): number {
  // Approximate IST wall time as UTC+5:30 fixed offset for labeling.
  const [h, m] = hhmm.split(":").map(Number);
  const [y, mo, d] = sessionDate.split("-").map(Number);
  // IST = UTC+5:30 → UTC = IST - 5:30
  const utc = Date.UTC(y, mo - 1, d, h - 5, m - 30, 0);
  return Math.floor(utc / 1000);
}

/**
 * Build full F&O universe card for refined ranking (Upstox only).
 * Structure/FVG/liq/OB from `timeframe` intraday; vol avg from daily.
 */
export async function buildRankUniverse(opts: {
  timeframe?: IntradayInterval;
  lookback?: number;
  sessionDate?: string;
  /** Structure as-of HH:MM IST (default 15:15). */
  asOfHHMM?: string;
  force?: boolean;
  /**
   * Live board: read 5m from disk only (or empty → daily structure fallback).
   * When disk is cold, kick a background warm for the next request.
   */
  intradayDiskOnly?: boolean;
}): Promise<UniverseSnapshot> {
  const timeframe = opts.timeframe ?? "5minute";
  const lookback = opts.lookback ?? 3;
  const sessionDate = opts.sessionDate ?? getIstClock().date;
  const asOfHHMM = opts.asOfHHMM ?? "15:15";
  const asOfUnix = sessionAsOfUnix(sessionDate, asOfHHMM);
  const intradayDiskOnly = opts.intradayDiskOnly ?? false;

  const [quotes, dailyMap, intraMap] = await Promise.all([
    // Arg is forceInstrumentRefresh — never pass board force=true here.
    fetchFoEquityQuotes(false),
    // Daily cards are disk-cached; live board never blocks on a full crawl.
    loadFoEquityDailyCandles({
      force: opts.force === true && !intradayDiskOnly,
      concurrency: 5,
      diskOnly: intradayDiskOnly,
    }),
    loadFoEquityIntradayCandles({
      interval: timeframe,
      sessionDate,
      force: false,
      concurrency: 4,
      diskOnly: intradayDiskOnly,
    }),
  ]);

  // First pass: raw chg for sector medians
  const chgBySymbol = new Map<string, number>();
  for (const meta of FO_STOCKS) {
    const q = quotes.get(meta.symbol);
    if (!q) continue;
    chgBySymbol.set(meta.symbol, equityChangePct(q));
  }

  const sectorPeers = new Map<string, string[]>();
  for (const meta of FO_STOCKS) {
    const list = sectorPeers.get(meta.sector) ?? [];
    list.push(meta.symbol);
    sectorPeers.set(meta.sector, list);
  }

  function sectorMedian(symbol: string, sector: string): number | null {
    const peers = (sectorPeers.get(sector) ?? []).filter((s) => s !== symbol);
    const vals = peers
      .map((s) => chgBySymbol.get(s))
      .filter((v): v is number => v != null && Number.isFinite(v));
    if (vals.length < 3) return null;
    return median(vals);
  }

  const rows: UniverseRow[] = [];

  for (const meta of FO_STOCKS) {
    const q = quotes.get(meta.symbol);
    if (!q) continue;
    const last = Number(q.last_price ?? 0);
    if (!last) continue;

    const prevClose = Number(q.prev_close_price ?? q.ohlc?.close ?? 0);
    const open = Number(q.ohlc?.open ?? 0);
    const chg =
      prevClose > 0
        ? ((last - prevClose) / prevClose) * 100
        : equityChangePct(q);
    const gap_pct =
      prevClose > 0 && open > 0 ? ((open - prevClose) / prevClose) * 100 : null;
    const intraday_pct =
      open > 0 ? ((last - open) / open) * 100 : null;
    // Keep flat day names if gap-fade / intraday move is meaningful (e.g. LICI-class).
    const moveProxy = Math.max(
      Math.abs(chg),
      Math.abs(intraday_pct ?? 0),
      Math.abs(gap_pct ?? 0),
    );
    if (moveProxy < 0.05) continue;

    const side = inferHypoSide({
      chg_pct: chg,
      gap_pct,
      intraday_pct,
    });

    const daily = dailyMap.get(meta.symbol) ?? [];
    const intraday = (intraMap.get(meta.symbol) ?? []).filter(
      (c) => c.time <= asOfUnix + 60,
    );

    const derived = deriveHypoFields(daily, side, last, {
      lookback,
      asOfUnix,
      intraday: intraday.length ? intraday : undefined,
    });

    // FVG re-check on truncated intraday for "price inside"
    let fvg = derived.fvg;
    if (intraday.length >= 3) {
      const gaps = detectFairValueGaps(
        intraday.filter((c) => c.time <= asOfUnix),
      ).filter((g) => !g.filled);
      if (gaps.length) {
        const inside = gaps.some(
          (g) => last <= g.top && last >= g.bottom,
        );
        fvg = inside ? "inside" : "outside";
      }
    }

    const avg20 = derived.avg_volume_20d ?? avgVolume20d(daily, sessionDate);
    const volume = Number(q.volume ?? 0) || null;
    const vol_ratio =
      volume && avg20 && avg20 > 0 ? volume / avg20 : null;

    const yh = Number(q.year_high ?? 0) || null;
    const yl = Number(q.year_low ?? 0) || null;
    const dayHigh = Number(q.ohlc?.high ?? 0) || null;
    const dayLow = Number(q.ohlc?.low ?? 0) || null;
    const peer = sectorMedian(meta.symbol, meta.sector);
    const stock = symbolMap.get(meta.symbol) ?? meta;

    rows.push({
      symbol: meta.symbol,
      name: stock.name,
      sector: stock.sector,
      side,
      last,
      price: last,
      open: open || null,
      high: dayHigh,
      low: dayLow,
      prevClose,
      chg_pct: +chg.toFixed(4),
      gap_pct: gap_pct == null ? null : +gap_pct.toFixed(4),
      intraday_pct:
        intraday_pct == null ? null : +intraday_pct.toFixed(4),
      sector_peer_pct: peer,
      sector_chg: peer,
      volume,
      avg_volume_20d: avg20,
      vol_ratio,
      dist_52w_high_pct: yh ? distPct(last, yh) : null,
      dist_52w_low_pct: yl ? distPct(last, yl) : null,
      structure: derived.structure,
      structureTime: derived.structureTime,
      ob_dist_pct: derived.ob_dist_pct,
      fvg,
      liq: derived.liq,
      timeframe,
      lookback,
    });
  }

  // Recompute peer medians on the final ranked universe (score_v3.add_peer_sector).
  addPeerSector(rows);

  return {
    sessionDate,
    timeframe,
    lookback,
    asOfLabel: asOfHHMM,
    quoted: quotes.size,
    rows,
  };
}

/** Filter intraday bars to one IST session date. */
export function filterSession(candles: Candle[], sessionDate: string): Candle[] {
  return candles.filter((c) => {
    const d = new Date(c.time * 1000).toLocaleDateString("en-CA", {
      timeZone: "Asia/Kolkata",
    });
    return d === sessionDate;
  });
}

export type { EquityQuote };
