/**
 * Hypothesis scoring for order-block ranking (port of score.py).
 * Weights are untuned priors. Missing card fields are skipped (coverage drops).
 */

export type HypoSide = "bull" | "bear";

export interface HypoStockInput {
  symbol: string;
  side: HypoSide;
  /** Actual screen rank when evaluating a labeled snapshot (optional). */
  rank?: number;
  chg_pct?: number | null;
  sector_chg_pct?: number | null;
  volume?: number | null;
  avg_volume_20d?: number | null;
  dist_52w_high_pct?: number | null;
  dist_52w_low_pct?: number | null;
  /** e.g. "BOS up", "CHOCH down" */
  structure?: string | null;
  ob_dist_pct?: number | null;
  fvg?: string | null;
  liq?: string | null;
}

export type FeatureKey =
  | "rel"
  | "chg"
  | "vol"
  | "near"
  | "struct"
  | "ob"
  | "fvg"
  | "liq";

export type FeatureMap = Partial<Record<FeatureKey, number | null>>;

export const W0: Record<FeatureKey, number> = {
  rel: 0.3,
  chg: 0.1,
  vol: 0.15,
  near: 0.1,
  struct: 0.15,
  ob: 0.1,
  fvg: 0.05,
  liq: 0.05,
};

export function clamp(x: number, lo = -1, hi = 1): number {
  return Math.max(lo, Math.min(hi, x));
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** Build signed features in [-1, 1] (vol/near clamped to [0, 1]). */
export function features(s: HypoStockInput): FeatureMap {
  const g = s.side === "bull" ? 1 : -1;
  const f: FeatureMap = {};

  const chg = num(s.chg_pct);
  const sec = num(s.sector_chg_pct);
  f.chg = chg == null ? null : clamp((g * chg) / 10);
  f.rel =
    chg == null || sec == null ? null : clamp((g * (chg - sec)) / 5);

  const vol = num(s.volume);
  const avg = num(s.avg_volume_20d);
  f.vol =
    !vol || !avg || avg <= 0
      ? null
      : clamp(Math.log2(vol / avg) / 3, 0, 1);

  const d =
    g === 1 ? num(s.dist_52w_high_pct) : num(s.dist_52w_low_pct);
  f.near = d == null ? null : clamp(1 - d / 10, 0, 1);

  const st = s.structure;
  if (st) {
    const aligned = st.includes("up") === (g === 1);
    const base = st.startsWith("BOS") ? 1.0 : 0.7;
    f.struct = aligned ? base : -base * 0.7;
  } else {
    f.struct = null;
  }

  const ob = num(s.ob_dist_pct);
  f.ob = ob == null ? null : clamp(1 - ob / 10, 0, 1);

  const fv = s.fvg;
  f.fvg =
    fv == null || fv === ""
      ? null
      : String(fv).includes("inside")
        ? 1.0
        : 0.0;

  const lq = s.liq;
  f.liq =
    lq == null || lq === ""
      ? null
      : String(lq).includes("swept") && !String(lq).includes("not")
        ? 1.0
        : 0.0;

  return f;
}

export function score(
  s: HypoStockInput,
  W: Record<FeatureKey, number> = W0,
): { score: number; coverage: number; features: FeatureMap } {
  const f = features(s);
  const got = Object.entries(f).filter(
    ([, v]) => v != null,
  ) as [FeatureKey, number][];
  const total = got.reduce((sum, [k, v]) => sum + W[k] * v, 0);
  return {
    score: total,
    coverage: got.length / Object.keys(W).length,
    features: f,
  };
}

export function rankByHypothesisScore(
  stocks: HypoStockInput[],
  side: HypoSide,
  W: Record<FeatureKey, number> = W0,
): Array<HypoStockInput & { hypoScore: number; coverage: number }> {
  return stocks
    .filter((s) => s.side === side)
    .map((s) => {
      const r = score(s, W);
      return { ...s, hypoScore: r.score, coverage: r.coverage };
    })
    .sort(
      (a, b) =>
        b.hypoScore - a.hypoScore || b.coverage - a.coverage,
    );
}
