/**
 * score_v2: refined hypothesis scorer (port of score_v2.py).
 * Family retained for Market Data scorer dropdown (alongside v1 / v3).
 * Default production flags = V3 (tanh + gap + sector).
 */

import { clamp } from "./hypothesisScore";
import type { HypoSide } from "./hypothesisScore";

export type ScoreV2FeatureKey =
  | "mag"
  | "sector"
  | "vol"
  | "struct"
  | "ob"
  | "near"
  | "fvg"
  | "liq";

export const W0_V2: Record<ScoreV2FeatureKey, number> = {
  mag: 0.25,
  sector: 0.2,
  vol: 0.15,
  struct: 0.1,
  ob: 0.1,
  near: 0.1,
  fvg: 0.05,
  liq: 0.05,
};

export type ScoreV2Flags = {
  tanh: boolean;
  gap: boolean;
  sector: boolean;
};

export const SCORE_V2_VARIANTS: Record<
  "V0" | "V1" | "V2" | "V3",
  ScoreV2Flags
> = {
  V0: { tanh: false, gap: false, sector: false },
  V1: { tanh: true, gap: false, sector: false },
  V2: { tanh: true, gap: true, sector: false },
  V3: { tanh: true, gap: true, sector: true },
};

export interface ScoreV2Input {
  symbol: string;
  side: HypoSide;
  chg_pct: number | null;
  gap_pct?: number | null;
  sector_chg?: number | null;
  sector_chg_pct?: number | null;
  sector_peer_pct?: number | null;
  volume: number | null;
  avg_volume_20d: number | null;
  dist_52w_high_pct: number | null;
  dist_52w_low_pct: number | null;
  structure: string | null;
  ob_dist_pct: number | null;
  fvg: string | null;
  liq: string | null;
}

export type ScoreV2FeatureMap = Record<ScoreV2FeatureKey, number | null>;

function num(s: ScoreV2Input, k: keyof ScoreV2Input): number | null {
  const v = s[k];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function sectorChgOf(s: ScoreV2Input): number | null {
  return (
    num(s, "sector_peer_pct") ??
    num(s, "sector_chg_pct") ??
    num(s, "sector_chg")
  );
}

export function featuresV2(
  s: ScoreV2Input,
  v: ScoreV2Flags = SCORE_V2_VARIANTS.V3,
): ScoreV2FeatureMap {
  const g = s.side === "bull" ? 1 : -1;
  const f: ScoreV2FeatureMap = {
    mag: null,
    sector: null,
    vol: null,
    struct: null,
    ob: null,
    near: null,
    fvg: null,
    liq: null,
  };

  const chg = num(s, "chg_pct");
  if (chg == null) {
    f.mag = null;
  } else {
    const aligned = chg > 0 === (g === 1);
    let m = 0;
    if (aligned) {
      m = v.tanh
        ? Math.tanh(Math.abs(chg) / 5)
        : clamp(Math.abs(chg) / 10, 0, 1);
      const gap = num(s, "gap_pct");
      if (v.gap && gap != null && Math.abs(chg) > 1e-12) {
        if (Math.abs(gap) / Math.abs(chg) > 0.7) m *= 0.5;
      }
    }
    f.mag = m;
  }

  const sec = sectorChgOf(s);
  f.sector =
    !v.sector || sec == null ? null : clamp(Math.tanh((g * sec) / 2), 0, 1);

  const vol = num(s, "volume");
  const avg = num(s, "avg_volume_20d");
  f.vol =
    !vol || !avg || avg <= 0
      ? null
      : clamp(Math.log2(Math.max(vol / avg, 1e-9)) / 3, 0, 1);

  const d =
    g === 1 ? num(s, "dist_52w_high_pct") : num(s, "dist_52w_low_pct");
  f.near = d == null ? null : clamp(1 - d / 10, 0, 1);

  const st = s.structure;
  if (st) {
    const base = st.startsWith("BOS") ? 1.0 : 0.7;
    f.struct = st.includes("up") === (g === 1) ? base : -0.4;
  } else {
    f.struct = null;
  }

  const ob = num(s, "ob_dist_pct");
  f.ob = ob == null ? null : clamp(1 - ob / 10, 0, 1);

  const fv = s.fvg;
  f.fvg =
    fv == null || fv === ""
      ? null
      : String(fv).includes("inside")
        ? 1
        : 0;

  const lq = s.liq;
  f.liq =
    lq == null || lq === ""
      ? null
      : String(lq).includes("swept") && !String(lq).includes("not")
        ? 1
        : 0;

  return f;
}

export function scoreV2(
  s: ScoreV2Input,
  v: ScoreV2Flags = SCORE_V2_VARIANTS.V3,
  W: Record<ScoreV2FeatureKey, number> = W0_V2,
): { score: number; coverage: number; features: ScoreV2FeatureMap } {
  const raw = featuresV2(s, v);
  const got: Partial<Record<ScoreV2FeatureKey, number>> = {};
  for (const [k, x] of Object.entries(raw) as [
    ScoreV2FeatureKey,
    number | null,
  ][]) {
    if (x == null) continue;
    if (!(W[k] > 0)) continue;
    if (k === "sector" && !v.sector) continue;
    got[k] = x;
  }
  const used = Object.keys(got).reduce(
    (sum, k) => sum + W[k as ScoreV2FeatureKey],
    0,
  );
  const totalW = Object.values(W).reduce((a, b) => a + b, 0);
  const total =
    used > 0
      ? Object.entries(got).reduce(
          (sum, [k, x]) => sum + W[k as ScoreV2FeatureKey] * (x as number),
          0,
        ) / used
      : 0;
  return {
    score: total,
    coverage: totalW > 0 ? used / totalW : 0,
    features: raw,
  };
}

export function rankScoreV2(
  stocks: ScoreV2Input[],
  side: HypoSide,
  flags: ScoreV2Flags = SCORE_V2_VARIANTS.V3,
): Array<
  ScoreV2Input & {
    score: number;
    coverage: number;
    features: ScoreV2FeatureMap;
    rank: number;
    tie: boolean;
  }
> {
  const scored = stocks
    .filter((s) => s.side === side)
    .map((s) => {
      const r = scoreV2(s, flags);
      return { ...s, score: r.score, coverage: r.coverage, features: r.features };
    })
    .sort((a, b) => b.score - a.score || b.coverage - a.coverage);

  return scored.map((s, i) => {
    const prev = scored[i - 1];
    const next = scored[i + 1];
    const tie =
      (prev != null && Math.abs(prev.score - s.score) <= 0.02) ||
      (next != null && Math.abs(next.score - s.score) <= 0.02);
    return { ...s, rank: i + 1, tie };
  });
}
