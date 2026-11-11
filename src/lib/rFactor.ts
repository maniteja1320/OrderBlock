import type { Candle } from "./types";

/**
 * TradeFinder-style R-Factor (Sector Scope / unusual-activity score).
 *
 * Direction-neutral intensity from relative volume, range, move, and ATR:
 *   relVol   = today_volume / avg_volume_20d
 *   relRange = (today_high − today_low) / today_close
 *   relMove  = |today_close − today_open| / today_open
 *   relATR   = today_TR / ATR_20
 *   R_raw    = relVol × relRange × (1 + relMove) × relATR
 *   R_score  = 100 × R_raw / max(R_raw across universe)
 *
 * Ref: TradeFinder Sector Scope / R-Factor methodology
 * (same product surface as https://tradefinder.in).
 */

export interface RFactorInputs {
  open: number;
  high: number;
  low: number;
  last: number;
  volume: number;
  previousClose: number;
  /** Completed prior sessions (oldest → newest), excluding today. */
  priorDaily: Candle[];
}

export interface RFactorComponents {
  relVol: number;
  relRange: number;
  relMove: number;
  relAtr: number;
  avgVolume20d: number;
  atr20: number;
  todayTr: number;
  rRaw: number;
}

export function trueRange(
  high: number,
  low: number,
  prevClose: number,
): number {
  return Math.max(
    high - low,
    Math.abs(high - prevClose),
    Math.abs(low - prevClose),
  );
}

/** Average true range over the last `n` completed sessions. */
export function atrN(priorDaily: Candle[], n = 20): number | null {
  if (priorDaily.length < 2) return null;
  const slice = priorDaily.slice(-(n + 1));
  const trs: number[] = [];
  for (let i = 1; i < slice.length; i++) {
    const prev = slice[i - 1].close;
    const c = slice[i];
    if (!(prev > 0 && c.high > 0 && c.low > 0)) continue;
    trs.push(trueRange(c.high, c.low, prev));
  }
  const use = trs.slice(-n);
  if (use.length < Math.min(5, n)) return null;
  return use.reduce((a, b) => a + b, 0) / use.length;
}

export function avgVolumeN(priorDaily: Candle[], n = 20): number | null {
  const vols = priorDaily
    .filter((c) => c.volume > 0)
    .slice(-n)
    .map((c) => c.volume);
  if (vols.length < Math.min(5, n)) return null;
  return vols.reduce((a, b) => a + b, 0) / vols.length;
}

/** Raw (unnormalized) R-factor. Returns null if baselines are missing. */
export function computeRFactorRaw(
  input: RFactorInputs,
): RFactorComponents | null {
  const { open, high, low, last, volume, previousClose, priorDaily } = input;
  if (
    !(
      open > 0 &&
      high > 0 &&
      low > 0 &&
      last > 0 &&
      Number.isFinite(volume) &&
      volume >= 0
    )
  ) {
    return null;
  }

  const avgVolume20d = avgVolumeN(priorDaily, 20);
  const atr20 = atrN(priorDaily, 20);
  if (avgVolume20d == null || avgVolume20d <= 0 || atr20 == null || atr20 <= 0) {
    return null;
  }

  const prev = previousClose > 0 ? previousClose : open;
  const todayTr = trueRange(high, low, prev);
  const relVol = volume / avgVolume20d;
  const relRange = (high - low) / last;
  const relMove = Math.abs(last - open) / open;
  const relAtr = todayTr / atr20;
  const rRaw = relVol * relRange * (1 + relMove) * relAtr;

  if (!Number.isFinite(rRaw) || rRaw < 0) return null;

  return {
    relVol,
    relRange,
    relMove,
    relAtr,
    avgVolume20d,
    atr20,
    todayTr,
    rRaw,
  };
}

/** Normalize raw scores to 0–100 vs the universe max. */
export function normalizeRScores(
  raws: Array<number | null>,
): Array<number | null> {
  let max = 0;
  for (const r of raws) {
    if (r != null && Number.isFinite(r) && r > max) max = r;
  }
  if (max <= 0) return raws.map(() => null);
  return raws.map((r) =>
    r == null || !Number.isFinite(r) ? null : +((100 * r) / max).toFixed(2),
  );
}
