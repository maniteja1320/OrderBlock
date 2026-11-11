/**
 * Market Data hypothesis scorer registry: score_v1 | score_v2 | score_v3.
 */

import {
  rankByHypothesisScore,
  score as scoreV1,
  type HypoSide,
  type HypoStockInput,
} from "./hypothesisScore";
import {
  constantFeatures,
  rankRefined,
  type RefinedFeatureMap,
  type RefinedStockInput,
} from "./refinedScore";
import { rankScoreV2, type ScoreV2Input } from "./scoreV2";
import type { HypoScorerId } from "./hypoScorerIds";

export type { HypoScorerId } from "./hypoScorerIds";
export {
  HYPO_SCORER_IDS,
  HYPO_SCORER_LABELS,
  isHypoScorerId,
} from "./hypoScorerIds";

export type RankedHypoRow = RefinedStockInput & {
  score: number;
  coverage: number;
  features: Record<string, number | null>;
  rank: number;
  tie: boolean;
};

function withTies<T extends { score: number }>(
  scored: T[],
): Array<T & { rank: number; tie: boolean }> {
  return scored.map((s, i) => {
    const prev = scored[i - 1];
    const next = scored[i + 1];
    const tie =
      (prev != null && Math.abs(prev.score - s.score) <= 0.02) ||
      (next != null && Math.abs(next.score - s.score) <= 0.02);
    return { ...s, rank: i + 1, tie };
  });
}

/** Rank one side with the selected scorer family. */
export function rankByScorer(
  stocks: RefinedStockInput[],
  side: HypoSide,
  scorer: HypoScorerId,
): RankedHypoRow[] {
  if (scorer === "score_v1") {
    const bySym = new Map(stocks.map((s) => [s.symbol, s]));
    const inputs: HypoStockInput[] = stocks.map((s) => ({
      symbol: s.symbol,
      side: s.side,
      chg_pct: s.chg_pct,
      sector_chg_pct:
        s.sector_peer_pct ?? s.sector_chg_pct ?? s.sector_chg ?? null,
      volume: s.volume,
      avg_volume_20d: s.avg_volume_20d,
      dist_52w_high_pct: s.dist_52w_high_pct,
      dist_52w_low_pct: s.dist_52w_low_pct,
      structure: s.structure,
      ob_dist_pct: s.ob_dist_pct,
      fvg: s.fvg,
      liq: s.liq,
    }));
    const ranked = rankByHypothesisScore(inputs, side).map((r) => {
      const full = scoreV1(r);
      const base = bySym.get(r.symbol)!;
      return {
        ...base,
        score: r.hypoScore,
        coverage: r.coverage,
        features: full.features as Record<string, number | null>,
      };
    });
    return withTies(ranked);
  }

  if (scorer === "score_v2") {
    const ranked = rankScoreV2(stocks as ScoreV2Input[], side);
    return ranked.map((r) => ({
      ...r,
      features: r.features as Record<string, number | null>,
    }));
  }

  // score_v3
  const drop = constantFeatures(stocks);
  return rankRefined(stocks, side, "V3", drop).map((r) => ({
    ...r,
    features: r.features as RefinedFeatureMap as Record<string, number | null>,
  }));
}
