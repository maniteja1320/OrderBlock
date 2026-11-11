import { detectFairValueGaps } from "./fvg";
import { detectOrderBlocks } from "./orderBlock";
import { readStructure } from "./structure";
import type { Candle, Side } from "./types";
import { avgVolume20d } from "./upstox/equityCandles";
import type { HypoSide } from "./scanner/hypothesisScore";

export interface DerivedHypoFields {
  avg_volume_20d: number | null;
  structure: string | null;
  structureTime: string | null;
  ob_dist_pct: number | null;
  fvg: string | null;
  liq: string | null;
}

export function median(vals: number[]): number | null {
  if (!vals.length) return null;
  const a = [...vals].sort((x, y) => x - y);
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid]! : (a[mid - 1]! + a[mid]!) / 2;
}

/**
 * Derive score_v2 card fields. Prefer `intraday` (5m) for structure/FVG/liq/OB;
 * always use daily series for avg_volume_20d.
 */
export function deriveHypoFields(
  daily: Candle[],
  side: HypoSide,
  lastPrice: number,
  opts?: {
    lookback?: number;
    asOfUnix?: number;
    intraday?: Candle[];
  },
): DerivedHypoFields {
  const empty: DerivedHypoFields = {
    avg_volume_20d: null,
    structure: null,
    structureTime: null,
    ob_dist_pct: null,
    fvg: null,
    liq: null,
  };
  if (!lastPrice) return empty;

  const avg = daily.length ? avgVolume20d(daily) : null;

  let series =
    opts?.intraday && opts.intraday.length > 0 ? opts.intraday : daily;
  if (!series.length) {
    return { ...empty, avg_volume_20d: avg };
  }
  if (opts?.asOfUnix != null) {
    series = series.filter((c) => c.time <= opts.asOfUnix!);
  }
  if (!series.length) {
    return { ...empty, avg_volume_20d: avg };
  }

  const struct = readStructure(series, {
    lookback: opts?.lookback,
    asOfUnix: opts?.asOfUnix,
  });
  let structure: string | null = null;
  if (struct.event === "BOS" || struct.event === "CHOCH") {
    const dir = struct.direction ?? (side === "bull" ? "up" : "down");
    structure = `${struct.event} ${dir}`;
  }

  const obSide: Side = side === "bull" ? "bullish" : "bearish";
  const zones = detectOrderBlocks(series, obSide).filter((z) => z.confirmed);
  let ob_dist_pct: number | null = null;
  if (zones.length) {
    const nearest = zones
      .map((z) => {
        const mid = (z.top + z.bottom) / 2;
        return { mid, dist: (Math.abs(lastPrice - mid) / lastPrice) * 100 };
      })
      .sort((a, b) => a.dist - b.dist)[0];
    ob_dist_pct = nearest ? +nearest.dist.toFixed(3) : null;
  }

  const gaps = detectFairValueGaps(series).filter((g) => !g.filled);
  const inside = gaps.some(
    (g) => lastPrice <= g.top && lastPrice >= g.bottom,
  );
  const fvg = gaps.length ? (inside ? "inside" : "outside") : null;

  const liq =
    struct.liquidityPrice != null
      ? struct.liquiditySwept
        ? "swept"
        : "not swept"
      : null;

  return {
    avg_volume_20d: avg,
    structure,
    structureTime: struct.timeLabel,
    ob_dist_pct,
    fvg,
    liq,
  };
}
