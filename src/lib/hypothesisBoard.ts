import { getIstClock, getMarketStatus } from "./marketHours";
import { buildRankUniverse } from "./rankEval/buildUniverse";
import {
  constantFeatures,
  uninformative,
} from "./scanner/refinedScore";
import { rankByScorer } from "./scanner/hypoScorers";
import {
  isHypoScorerId,
  type HypoScorerId,
} from "./scanner/hypoScorerIds";
import { getMarketDataFeed } from "./upstox/marketDataFeed";
import type {
  HypothesisBoardResponse,
  HypothesisRankRow,
} from "./hypothesisBoardTypes";

export type { HypoScorerId };
export type { HypothesisBoardResponse, HypothesisRankRow } from "./hypothesisBoardTypes";
export {
  HYPO_SCORER_IDS,
  HYPO_SCORER_LABELS,
  isHypoScorerId,
} from "./scanner/hypoScorerIds";

const cacheByScorer = new Map<
  HypoScorerId,
  { at: number; data: HypothesisBoardResponse }
>();
const prevRanksByScorer = new Map<HypoScorerId, Map<string, number>>();

function emptyBoard(
  scorer: HypoScorerId,
  error?: string,
): HypothesisBoardResponse {
  return {
    updatedAt: new Date().toISOString(),
    marketStatus: getMarketStatus(),
    source: "upstox",
    scorer,
    universe: 0,
    quoted: 0,
    candleSymbols: 0,
    timeframe: "5minute",
    lookback: 2,
    droppedConstant: [],
    uninformative: {},
    all: [],
    bullish: [],
    bearish: [],
    error,
  };
}

/**
 * Market Data ranking — selectable score_v1 | score_v2 | score_v3.
 */
export async function computeHypothesisBoard(
  force = false,
  scorerInput: HypoScorerId | string = "score_v3",
): Promise<HypothesisBoardResponse> {
  const scorer: HypoScorerId = isHypoScorerId(scorerInput)
    ? scorerInput
    : "score_v3";
  const now = Date.now();
  const hit = cacheByScorer.get(scorer);
  if (!force && hit && now - hit.at < 55_000) {
    return hit.data;
  }

  if (!process.env.UPSTOX_ACCESS_TOKEN?.trim()) {
    return emptyBoard(
      scorer,
      "UPSTOX_ACCESS_TOKEN missing. Add it to .env.local and restart the server.",
    );
  }

  try {
    void getMarketDataFeed().ensureStarted();
  } catch {
    /* optional */
  }

  const sessionDate = getIstClock().date;
  const lookback = 2;
  const timeframe = "5minute" as const;

  const snap = await buildRankUniverse({
    sessionDate,
    timeframe,
    lookback,
    asOfHHMM: "15:15",
    force,
    intradayDiskOnly: true,
  });

  const nameBy = new Map(snap.rows.map((r) => [r.symbol, r]));
  const drop =
    scorer === "score_v3" ? [...constantFeatures(snap.rows)].sort() : [];
  const prevRanks = prevRanksByScorer.get(scorer) ?? new Map<string, number>();

  const toBoardRow = (
    r: ReturnType<typeof rankByScorer>[number],
  ): HypothesisRankRow => {
    const meta = nameBy.get(r.symbol)!;
    const key = `${r.side}:${r.symbol}`;
    const prev = prevRanks.get(key);
    return {
      symbol: r.symbol,
      name: meta.name,
      sector: meta.sector,
      side: r.side,
      last: meta.last,
      changePct: +(r.chg_pct ?? 0).toFixed(3),
      sectorChgPct: +(
        r.sector_peer_pct ??
        r.sector_chg ??
        meta.sector_chg ??
        0
      ).toFixed(3),
      gapPct: r.gap_pct ?? null,
      volume: r.volume ?? 0,
      avgVolume20d: r.avg_volume_20d,
      dist52wHighPct: r.dist_52w_high_pct,
      dist52wLowPct: r.dist_52w_low_pct,
      structure: r.structure,
      obDistPct: r.ob_dist_pct,
      fvg: r.fvg,
      liq: r.liq,
      score: +r.score.toFixed(4),
      coverage: +r.coverage.toFixed(3),
      rank: r.rank,
      rankChange: prev != null ? prev - r.rank : 0,
      features: r.features,
    };
  };

  const bullish = rankByScorer(snap.rows, "bull", scorer)
    .slice(0, 20)
    .map(toBoardRow);
  const bearish = rankByScorer(snap.rows, "bear", scorer)
    .slice(0, 20)
    .map(toBoardRow);
  const all = [
    ...rankByScorer(snap.rows, "bull", scorer).map(toBoardRow),
    ...rankByScorer(snap.rows, "bear", scorer).map(toBoardRow),
  ];

  const nextPrev = new Map<string, number>();
  for (const r of bullish) nextPrev.set(`bull:${r.symbol}`, r.rank);
  for (const r of bearish) nextPrev.set(`bear:${r.symbol}`, r.rank);
  prevRanksByScorer.set(scorer, nextPrev);

  const data: HypothesisBoardResponse = {
    updatedAt: new Date().toISOString(),
    marketStatus: getMarketStatus(),
    source: "upstox",
    scorer,
    universe: snap.rows.length,
    quoted: snap.quoted,
    candleSymbols: snap.rows.filter((r) => r.structure != null || r.fvg != null)
      .length,
    timeframe,
    lookback,
    droppedConstant: drop,
    uninformative: uninformative(
      snap.rows.map((r) => ({
        structure: r.structure,
        fvg: r.fvg,
        liq: r.liq,
        sector: r.sector,
      })),
    ),
    all,
    bullish,
    bearish,
  };
  cacheByScorer.set(scorer, { at: now, data });
  return data;
}
