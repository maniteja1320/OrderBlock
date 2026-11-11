/**
 * score_v3: hypothesis scorer (port of score_v3.py).
 * Driven by 5–6 Nov 2026 evidence. Weights are untuned priors.
 *
 * vs score_v2: capped/down-weighted mag; intraday (ltp vs open + day-range
 * position); F&O peer-median sector (index sector fallback); auto-drop
 * features that are >95% constant across the universe.
 */

import { clamp } from "./hypothesisScore";
import type { HypoSide } from "./hypothesisScore";

export type RefinedFeatureKey =
  | "mag"
  | "intraday"
  | "sector"
  | "vol"
  | "struct"
  | "ob"
  | "near"
  | "fvg"
  | "liq";

/** Untuned priors from score_v3.py W0. */
export const W0: Record<RefinedFeatureKey, number> = {
  mag: 0.1,
  intraday: 0.15,
  sector: 0.2,
  vol: 0.1,
  struct: 0.15,
  ob: 0.1,
  near: 0.05,
  fvg: 0.075,
  liq: 0.075,
};

/** @deprecated use W0 */
export const W_REFINED = W0;

export const MAG_CAP = 6.0;

export interface RefinedStockInput {
  symbol: string;
  side: HypoSide;
  chg_pct: number | null;
  gap_pct?: number | null;
  /** LTP / last. */
  price?: number | null;
  open?: number | null;
  high?: number | null;
  low?: number | null;
  /** F&O peer-median day chg (preferred). */
  sector_peer_pct?: number | null;
  /** Index / legacy sector chg fallback. */
  sector_chg?: number | null;
  sector_chg_pct?: number | null;
  intraday_pct?: number | null;
  volume: number | null;
  avg_volume_20d: number | null;
  dist_52w_high_pct: number | null;
  dist_52w_low_pct: number | null;
  structure: string | null;
  ob_dist_pct: number | null;
  fvg: string | null;
  liq: string | null;
}

export type RefinedFeatureMap = Record<RefinedFeatureKey, number | null>;

/** Production label — score_v3 has no V0–V4 flag matrix. */
export type ScoreVariant = "V3";

function num(s: RefinedStockInput, k: keyof RefinedStockInput): number | null {
  const v = s[k];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function sectorOf(s: RefinedStockInput): number | null {
  return (
    num(s, "sector_peer_pct") ??
    num(s, "sector_chg_pct") ??
    num(s, "sector_chg")
  );
}

/**
 * Gap-fade side: when gap and intraday conflict, thesis follows intraday
 * (supports recovery names that are still red vs prev close).
 */
export function inferHypoSide(input: {
  chg_pct: number | null;
  gap_pct: number | null;
  intraday_pct: number | null;
}): HypoSide {
  const chg = input.chg_pct ?? 0;
  const gap = input.gap_pct;
  const intra = input.intraday_pct;
  if (
    gap != null &&
    intra != null &&
    Math.abs(gap) >= 0.3 &&
    Math.abs(intra) >= 0.15 &&
    gap > 0 !== intra > 0
  ) {
    return intra > 0 ? "bull" : "bear";
  }
  if (Math.abs(chg) < 1e-9 && intra != null) {
    return intra > 0 ? "bull" : "bear";
  }
  return chg > 0 ? "bull" : "bear";
}

/** Peer-median chg of OTHER stocks in the same sector (needs full universe). */
export function addPeerSector(
  stocks: Array<RefinedStockInput & { sector?: string }>,
  minPeers = 3,
): void {
  const by = new Map<string, Array<RefinedStockInput & { sector?: string }>>();
  for (const s of stocks) {
    if (num(s, "chg_pct") == null || !s.sector) continue;
    const list = by.get(s.sector) ?? [];
    list.push(s);
    by.set(s.sector, list);
  }
  for (const s of stocks) {
    const peers = (by.get(s.sector ?? "") ?? []).filter((p) => p !== s);
    const vals = peers
      .map((p) => num(p, "chg_pct"))
      .filter((v): v is number => v != null);
    if (vals.length < minPeers) {
      s.sector_peer_pct = null;
      continue;
    }
    const sorted = [...vals].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    s.sector_peer_pct =
      sorted.length % 2
        ? sorted[mid]!
        : (sorted[mid - 1]! + sorted[mid]!) / 2;
  }
}

/** Build score_v3 features for one stock. */
export function features(s: RefinedStockInput): RefinedFeatureMap {
  const g = s.side === "bull" ? 1 : -1;
  const f: RefinedFeatureMap = {
    mag: null,
    intraday: null,
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
    f.mag =
      chg > 0 === (g === 1)
        ? Math.min(Math.abs(chg), MAG_CAP) / MAG_CAP
        : 0;
  }

  const o = num(s, "open");
  const px = num(s, "price");
  const hi = num(s, "high");
  const lo = num(s, "low");
  const parts: number[] = [];
  if (o != null && o > 0 && px != null) {
    // score_v3: clamp(tanh(g * (px-o)/o * 100 / 2))
    parts.push(
      clamp(Math.tanh((((g * (px - o)) / o) * 100) / 2), 0, 1),
    );
  }
  if (hi != null && lo != null && px != null && hi > lo) {
    parts.push(
      g === 1 ? (px - lo) / (hi - lo) : (hi - px) / (hi - lo),
    );
  }
  f.intraday = parts.length ? parts.reduce((a, b) => a + b, 0) / parts.length : null;

  const sec = sectorOf(s);
  f.sector = sec == null ? null : clamp(Math.tanh((g * sec) / 2), 0, 1);

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

/**
 * Features where >95% of stocks share one rounded value (no information).
 * Matches score_v3.constant_features.
 */
export function constantFeatures(stocks: RefinedStockInput[]): Set<RefinedFeatureKey> {
  const cols = new Map<RefinedFeatureKey, Array<number | null>>();
  for (const s of stocks) {
    const f = features(s);
    for (const [k, v] of Object.entries(f) as [
      RefinedFeatureKey,
      number | null,
    ][]) {
      const list = cols.get(k) ?? [];
      list.push(v);
      cols.set(k, list);
    }
  }
  const out = new Set<RefinedFeatureKey>();
  for (const [k, vals] of cols) {
    if (!vals.length) continue;
    const counts = new Map<string, number>();
    for (const v of vals) {
      const key =
        v == null ? "null" : String(Math.round(v * 1000) / 1000);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    let best = 0;
    for (const n of counts.values()) if (n > best) best = n;
    if (best / vals.length > 0.95) out.add(k);
  }
  return out;
}

/**
 * Renormalised weighted score + coverage.
 * Matches score_v3.score().
 */
export function score(
  s: RefinedStockInput,
  W: Record<RefinedFeatureKey, number> = W0,
  drop: Iterable<RefinedFeatureKey> = [],
): { score: number; coverage: number; features: RefinedFeatureMap } {
  const dropSet = drop instanceof Set ? drop : new Set(drop);
  const raw = features(s);
  const got: Partial<Record<RefinedFeatureKey, number>> = {};
  for (const [k, x] of Object.entries(raw) as [
    RefinedFeatureKey,
    number | null,
  ][]) {
    if (x == null) continue;
    if (dropSet.has(k)) continue;
    if (!(W[k] > 0)) continue;
    got[k] = x;
  }
  const used = Object.keys(got).reduce(
    (sum, k) => sum + W[k as RefinedFeatureKey],
    0,
  );
  const totalW = (Object.keys(W) as RefinedFeatureKey[])
    .filter((k) => W[k] > 0 && !dropSet.has(k))
    .reduce((a, k) => a + W[k], 0);
  const total =
    used > 0
      ? Object.entries(got).reduce(
          (sum, [k, x]) => sum + W[k as RefinedFeatureKey] * (x as number),
          0,
        ) / used
      : 0;
  return {
    score: total,
    coverage: totalW > 0 ? used / totalW : 0,
    features: raw,
  };
}

/** @deprecated */
export function refinedFeatures(s: RefinedStockInput): RefinedFeatureMap {
  return features(s);
}

/** @deprecated */
export function refinedScore(
  s: RefinedStockInput,
  opts: { weights?: Partial<Record<RefinedFeatureKey, number>> } = {},
) {
  const W = { ...W0, ...opts.weights };
  const r = score(s, W);
  return { ...r, tieBand: 0.02 };
}

export function scoreVariant(s: RefinedStockInput, _variant: ScoreVariant = "V3") {
  return score(s, W0);
}

export function rankRefined(
  stocks: RefinedStockInput[],
  side: HypoSide,
  _variant: ScoreVariant = "V3",
  drop?: Iterable<RefinedFeatureKey>,
): Array<
  RefinedStockInput & {
    score: number;
    coverage: number;
    features: RefinedFeatureMap;
    rank: number;
    tie: boolean;
  }
> {
  const dropSet =
    drop != null ? (drop instanceof Set ? drop : new Set(drop)) : constantFeatures(stocks);
  const scored = stocks
    .filter((s) => s.side === side)
    .map((s) => {
      const r = score(s, W0, dropSet);
      return {
        ...s,
        score: r.score,
        coverage: r.coverage,
        features: r.features,
      };
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

/** Flag string card fields where >95% share one value (diagnostics). */
export function uninformative(
  stocks: Array<Record<string, unknown>>,
  keys: string[] = ["structure", "fvg", "liq", "sector"],
): Record<string, string> {
  const bad: Record<string, string> = {};
  for (const k of keys) {
    const vals = stocks.map((s) => String(s[k]));
    if (!vals.length) continue;
    const counts = new Map<string, number>();
    for (const v of vals) counts.set(v, (counts.get(v) ?? 0) + 1);
    let best = "";
    let c = 0;
    for (const [val, n] of counts) {
      if (n > c) {
        c = n;
        best = val;
      }
    }
    if (c / vals.length > 0.95) bad[k] = best;
  }
  return bad;
}
