import type { Candle, LevelMark, OrderBlockZone, Side } from "./types";

export type BuildUp =
  | "LONG BUILD-UP"
  | "SHORT BUILD-UP"
  | "SHORT COVERING"
  | "LONG UNWINDING"
  | "NEUTRAL";

export function computeVwap(candles: Candle[]): number | null {
  let pv = 0;
  let vol = 0;
  for (const c of candles) {
    const v = c.volume || 0;
    if (v <= 0) continue;
    const typical = (c.high + c.low + c.close) / 3;
    pv += typical * v;
    vol += v;
  }
  if (vol <= 0) return null;
  return pv / vol;
}

export function classifyBuildUp(
  changePct: number,
  oiChangePct: number | null,
): BuildUp {
  if (oiChangePct == null || !Number.isFinite(oiChangePct)) return "NEUTRAL";
  const priceUp = changePct > 0.15;
  const priceDown = changePct < -0.15;
  const oiUp = oiChangePct > 0.5;
  const oiDown = oiChangePct < -0.5;

  if (priceUp && oiUp) return "LONG BUILD-UP";
  if (priceUp && oiDown) return "SHORT COVERING";
  if (priceDown && oiUp) return "SHORT BUILD-UP";
  if (priceDown && oiDown) return "LONG UNWINDING";
  return "NEUTRAL";
}

/**
 * Risk:reward from Z mid to invalidation vs liquidity ahead.
 * Bullish: risk Z→S1, reward Z→R1/R2
 * Bearish: risk Z→R1, reward Z→S1/S2
 */
export function computeRiskReward(
  zone: OrderBlockZone | undefined,
  levels: LevelMark[],
  side: Side,
): { risk: number; reward: number; ratio: number; label: string } | null {
  if (!zone) return null;
  const z = (zone.top + zone.bottom) / 2;

  const invalidation =
    (side === "bullish"
      ? levels.find(
          (l) => l.label === "S1" && l.kind === "invalidation" && l.isCurrent,
        )
      : levels.find(
          (l) => l.label === "R1" && l.kind === "invalidation" && l.isCurrent,
        )) ??
    (side === "bullish"
      ? levels.find((l) => l.label === "S1" && l.kind === "invalidation")
      : levels.find((l) => l.label === "R1" && l.kind === "invalidation"));

  const rewardLevel =
    (side === "bullish"
      ? levels.find((l) => l.label === "R2" && l.isCurrent) ??
        levels.find(
          (l) => l.label === "R1" && l.kind === "resistance" && l.isCurrent,
        )
      : levels.find((l) => l.label === "S2" && l.isCurrent) ??
        levels.find(
          (l) => l.label === "S1" && l.kind === "support" && l.isCurrent,
        )) ??
    (side === "bullish"
      ? levels.find((l) => l.label === "R2") ??
        levels.find((l) => l.label === "R1" && l.kind === "resistance")
      : levels.find((l) => l.label === "S2") ??
        levels.find((l) => l.label === "S1" && l.kind === "support"));

  if (!invalidation || !rewardLevel) return null;

  const risk = Math.abs(z - invalidation.price);
  const reward = Math.abs(rewardLevel.price - z);
  if (risk <= 0) return null;
  const ratio = reward / risk;
  return {
    risk,
    reward,
    ratio,
    label: `1:${ratio.toFixed(1)}`,
  };
}

/** Simple conviction from strength (0–100 style). */
export function computeConviction(strength: number): number {
  return Math.min(99.9, Math.round(strength * 40 * 10) / 10);
}

export function pctVsVwap(last: number, vwap: number | null): number | null {
  if (vwap == null || vwap <= 0) return null;
  return ((last - vwap) / vwap) * 100;
}
