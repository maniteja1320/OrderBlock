import { mkdir, writeFile } from "fs/promises";
import path from "path";
import {
  rankRefined,
  scoreVariant,
  type RefinedFeatureMap,
  type ScoreVariant,
} from "../scanner/refinedScore";
import { readStructure } from "../structure";
import { detectFairValueGaps } from "../fvg";
import type { IntradayInterval } from "../upstox/equityCandles";
import { buildRankUniverse } from "./buildUniverse";
import {
  FVG_CHECKS_2026_11_05,
  STRUCTURE_CHECKS_2026_11_05,
  TRUE_TOP10_2026_11_05,
} from "./fixtures";
import { loadFoEquityIntradayCandles } from "../upstox/equityCandles";

function spearman(predRanks: number[], actualRanks: number[]): number {
  const n = predRanks.length;
  if (n < 3) return 0;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const d = predRanks[i] - actualRanks[i];
    sum += d * d;
  }
  return 1 - (6 * sum) / (n * (n * n - 1));
}

function overlapAtK(pred: string[], truth: string[], k: number): number {
  const a = new Set(pred.slice(0, k));
  const b = new Set(truth.slice(0, k));
  let n = 0;
  for (const x of a) if (b.has(x)) n += 1;
  return n;
}

function top3Hits(pred: string[], truth: string[]): number {
  const t = new Set(truth.slice(0, 3));
  return pred.slice(0, 3).filter((s) => t.has(s)).length;
}

export interface VariantMetrics {
  variant: string;
  side: "bull" | "bear";
  overlap10: number;
  top3_hits: number;
  spearman: number;
  predicted: string[];
}

function metricsForSide(
  variant: string,
  side: "bull" | "bear",
  predicted: string[],
  truth: readonly string[],
): VariantMetrics {
  const truthRank = new Map(truth.map((s, i) => [s, i + 1]));
  const inBoth = predicted.filter((s) => truthRank.has(s));
  const predR = inBoth.map((s) => predicted.indexOf(s) + 1);
  const actR = inBoth.map((s) => truthRank.get(s)!);
  return {
    variant,
    side,
    overlap10: overlapAtK(predicted, [...truth], 10),
    top3_hits: top3Hits(predicted, [...truth]),
    spearman: +spearman(predR, actR).toFixed(3),
    predicted,
  };
}

function timeClose(a: string | null, b: string | null, tolMin = 10): boolean {
  if (!a || !b) return true; // no expected time → only tag check
  const [ah, am] = a.split(":").map(Number);
  const [bh, bm] = b.split(":").map(Number);
  return Math.abs(ah * 60 + am - (bh * 60 + bm)) <= tolMin;
}

export async function runStructureCalibration(opts: {
  sessionDate: string;
  timeframe: IntradayInterval;
  lookback: number;
  asOfHHMM?: string;
  /** Preloaded intraday map — avoids refetching per lookback. */
  intra?: Map<string, import("../types").Candle[]>;
}) {
  const asOf = opts.asOfHHMM ?? "15:15";
  const [ah, am] = asOf.split(":").map(Number);
  const [y, mo, d] = opts.sessionDate.split("-").map(Number);
  const asOfUnix = Math.floor(
    Date.UTC(y, mo - 1, d, ah - 5, am - 30, 0) / 1000,
  );

  const symbols = [
    ...new Set([
      ...STRUCTURE_CHECKS_2026_11_05.map((c) => c.symbol),
      ...FVG_CHECKS_2026_11_05.map((c) => c.symbol),
    ]),
  ];

  const intra =
    opts.intra ??
    (await loadFoEquityIntradayCandles({
      interval: opts.timeframe,
      sessionDate: opts.sessionDate,
      symbols,
      concurrency: 3,
    }));

  const results: Array<{
    check: string;
    pass: boolean;
    detected: string;
    time: string | null;
  }> = [];

  for (const c of STRUCTURE_CHECKS_2026_11_05) {
    const bars = (intra.get(c.symbol) ?? []).filter((x) => x.time <= asOfUnix);
    const st = readStructure(bars, {
      lookback: opts.lookback,
      asOfUnix,
    });
    const tag =
      st.event !== "NONE" && st.direction
        ? `${st.event} ${st.direction}`
        : `${st.event}`;
    const expect = `${c.event} ${c.direction}`;
    const tagOk =
      st.event === c.event &&
      st.direction === c.direction;
    const timeOk = timeClose(st.timeLabel, c.timeApprox);
    results.push({
      check: `${c.symbol} expect ${expect}${c.timeApprox ? ` @${c.timeApprox}` : ""}`,
      pass: tagOk && timeOk,
      detected: tag,
      time: st.timeLabel,
    });
  }

  for (const c of FVG_CHECKS_2026_11_05) {
    const bars = (intra.get(c.symbol) ?? []).filter((x) => x.time <= asOfUnix);
    const last = bars[bars.length - 1]?.close;
    const gaps = detectFairValueGaps(bars).filter((g) => !g.filled);
    const inside =
      last != null &&
      gaps.some((g) => last <= g.top && last >= g.bottom);
    const detected = gaps.length ? (inside ? "inside" : "outside") : "none";
    results.push({
      check: `${c.symbol} FVG expect ${c.expect}`,
      pass: detected === c.expect,
      detected,
      time: null,
    });
  }

  const passed = results.filter((r) => r.pass).length;
  return { lookback: opts.lookback, timeframe: opts.timeframe, passed, total: results.length, results };
}

function featureDistribution(
  rows: Array<{ features: RefinedFeatureMap }>,
  key: keyof RefinedFeatureMap,
) {
  const vals = rows
    .map((r) => r.features[key])
    .filter((v): v is number => v != null);
  if (!vals.length) {
    return { key, n: 0, modeShare: 1, uninformative: true, note: "all null" };
  }
  // Bucket to 1 decimal for mode share
  const counts = new Map<string, number>();
  for (const v of vals) {
    const b = v.toFixed(1);
    counts.set(b, (counts.get(b) ?? 0) + 1);
  }
  let mode = 0;
  for (const c of counts.values()) mode = Math.max(mode, c);
  const modeShare = mode / vals.length;
  return {
    key,
    n: vals.length,
    modeShare: +modeShare.toFixed(3),
    uninformative: modeShare > 0.95,
    note: modeShare > 0.95 ? "FLAG >95% same bucket" : "ok",
  };
}

export async function compareVariants(opts: {
  sessionDate?: string;
  timeframe?: IntradayInterval;
  lookback?: number;
  force?: boolean;
}) {
  const sessionDate = opts.sessionDate ?? TRUE_TOP10_2026_11_05.date;
  const timeframe = opts.timeframe ?? "5minute";
  const lookback = opts.lookback ?? 3;

  const snap = await buildRankUniverse({
    sessionDate,
    timeframe,
    lookback,
    asOfHHMM: "15:15",
    force: opts.force,
  });

  const truth = TRUE_TOP10_2026_11_05;
  const table: VariantMetrics[] = [];

  // score_v3 (single production scorer)
  for (const variant of ["V3"] as ScoreVariant[]) {
    for (const side of ["bull", "bear"] as const) {
      const truthList = side === "bull" ? truth.bullish : truth.bearish;
      const ranked = rankRefined(snap.rows, side, variant);
      table.push(
        metricsForSide(
          variant,
          side,
          ranked.map((r) => r.symbol),
          truthList,
        ),
      );
    }
  }

  const v3Rows = [
    ...rankRefined(snap.rows, "bull", "V3"),
    ...rankRefined(snap.rows, "bear", "V3"),
  ];
  const diag = (["struct", "fvg", "liq"] as const).map((k) =>
    featureDistribution(v3Rows, k),
  );

  const csvPath = await writeUniverseCsv(snap, v3Rows);

  return {
    sessionDate,
    timeframe,
    lookback,
    quoted: snap.quoted,
    universeRows: snap.rows.length,
    table,
    diagnostics: diag,
    csvPath,
    topV3: {
      bull: rankRefined(snap.rows, "bull", "V3")
        .slice(0, 10)
        .map((r) => `${r.symbol}${r.tie ? "~" : ""}`),
      bear: rankRefined(snap.rows, "bear", "V3")
        .slice(0, 10)
        .map((r) => `${r.symbol}${r.tie ? "~" : ""}`),
    },
  };
}

async function writeUniverseCsv(
  snap: Awaited<ReturnType<typeof buildRankUniverse>>,
  ranked: ReturnType<typeof rankRefined>,
): Promise<string> {
  const bySym = new Map(ranked.map((r) => [r.symbol, r]));
  const ts = new Date().toISOString();
  const header = [
    "timestamp",
    "symbol",
    "side",
    "rank",
    "tie",
    "score",
    "sector",
    "sector_chg",
    "chg_pct",
    "gap_pct",
    "intraday_pct",
    "volume",
    "avg_volume_20d",
    "vol_ratio",
    "dist_52w_high_pct",
    "dist_52w_low_pct",
    "structure",
    "structure_time",
    "ob_dist_pct",
    "fvg",
    "liq",
    "feat_mag",
    "feat_intraday",
    "feat_sector",
    "feat_vol",
    "feat_struct",
    "feat_ob",
    "feat_near",
    "feat_fvg",
    "feat_liq",
    "timeframe",
    "lookback",
  ];

  const lines = [header.join(",")];
  for (const row of snap.rows) {
    const r =
      bySym.get(row.symbol) ??
      (() => {
        const s = scoreVariant(row, "V3");
        return {
          ...row,
          score: s.score,
          coverage: s.coverage,
          features: s.features,
          rank: 0,
          tie: false,
        };
      })();
    const f = r.features;
    lines.push(
      [
        ts,
        row.symbol,
        row.side,
        r.rank,
        r.tie ? 1 : 0,
        r.score.toFixed(6),
        row.sector,
        row.sector_peer_pct ?? row.sector_chg ?? "",
        row.chg_pct ?? "",
        row.gap_pct ?? "",
        row.intraday_pct ?? "",
        row.volume ?? "",
        row.avg_volume_20d ?? "",
        row.vol_ratio ?? "",
        row.dist_52w_high_pct ?? "",
        row.dist_52w_low_pct ?? "",
        row.structure ?? "",
        row.structureTime ?? "",
        row.ob_dist_pct ?? "",
        row.fvg ?? "",
        row.liq ?? "",
        f.mag ?? "",
        f.intraday ?? "",
        f.sector ?? "",
        f.vol ?? "",
        f.struct ?? "",
        f.ob ?? "",
        f.near ?? "",
        f.fvg ?? "",
        f.liq ?? "",
        snap.timeframe,
        snap.lookback,
      ].join(","),
    );
  }

  const dir = path.join(process.cwd(), "data", "rank-eval");
  await mkdir(dir, { recursive: true });
  const file = path.join(
    dir,
    `universe_${snap.sessionDate}_${snap.timeframe}_lb${snap.lookback}.csv`,
  );
  await writeFile(file, lines.join("\n"), "utf8");
  return file;
}

/** Pick swing lookback that passes the most calibration checks. */
export async function pickBestLookback(opts: {
  sessionDate: string;
  timeframe: IntradayInterval;
}) {
  const symbols = [
    ...new Set([
      ...STRUCTURE_CHECKS_2026_11_05.map((c) => c.symbol),
      ...FVG_CHECKS_2026_11_05.map((c) => c.symbol),
    ]),
  ];
  const intra = await loadFoEquityIntradayCandles({
    interval: opts.timeframe,
    sessionDate: opts.sessionDate,
    symbols,
    concurrency: 1,
  });
  const tried = [];
  for (const lookback of [2, 3, 5]) {
    const r = await runStructureCalibration({
      ...opts,
      lookback,
      intra,
    });
    tried.push(r);
  }
  tried.sort((a, b) => b.passed - a.passed || a.lookback - b.lookback);
  return { best: tried[0], all: tried };
}
