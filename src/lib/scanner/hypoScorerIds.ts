/**
 * Client-safe scorer ids/labels (no Node / Upstox imports).
 */

export const HYPO_SCORER_IDS = ["score_v1", "score_v2", "score_v3"] as const;
export type HypoScorerId = (typeof HYPO_SCORER_IDS)[number];

export const HYPO_SCORER_LABELS: Record<HypoScorerId, string> = {
  score_v1: "score_v1 · original W0",
  score_v2: "score_v2 · tanh/gap/sector",
  score_v3: "score_v3 · capped mag + intraday",
};

export function isHypoScorerId(
  v: string | null | undefined,
): v is HypoScorerId {
  return v === "score_v1" || v === "score_v2" || v === "score_v3";
}
