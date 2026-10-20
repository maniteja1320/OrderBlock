import type { Candle, Side } from "./types";

/** OHLC proxy — not exchange tick aggressor classification. */
export interface DeltaBar {
  time: number;
  volume: number;
  delta: number;
  cvd: number;
  buyVol: number;
  sellVol: number;
  /** High volume vs session + compressed range. */
  absorption: boolean;
  /** Volume outlier vs session distribution. */
  bigPrint: boolean;
}

export interface VolumeProfileBin {
  price: number;
  volume: number;
  buyVol: number;
  sellVol: number;
}

export interface VolumeProfile {
  bins: VolumeProfileBin[];
  poc: number;
  vah: number;
  val: number;
  totalVolume: number;
}

export interface SmartMoneySnapshot {
  /** Session CVD at last bar (proxy). */
  cvd: number;
  /** Last bar delta (proxy). */
  lastDelta: number;
  /** Price vs CVD: agree / diverge. */
  divergence: "none" | "bearish" | "bullish";
  relativeVolume: number;
  bigPrintCount: number;
  absorptionCount: number;
  profile: VolumeProfile | null;
  bars: DeltaBar[];
  /** 0–100 composite for scanner ranking. */
  score: number;
  bias: Side | "neutral";
  note: string;
}

/**
 * Close-location volume split (proxy for aggressor side).
 * buyShare ≈ how close the close sits to the high of the bar.
 */
export function splitVolume(c: Candle): { buyVol: number; sellVol: number; delta: number } {
  const range = c.high - c.low;
  const vol = Math.max(0, c.volume || 0);
  if (vol <= 0) return { buyVol: 0, sellVol: 0, delta: 0 };
  if (range <= 0) {
    const half = vol / 2;
    return { buyVol: half, sellVol: half, delta: 0 };
  }
  const buyShare = Math.min(1, Math.max(0, (c.close - c.low) / range));
  const buyVol = vol * buyShare;
  const sellVol = vol - buyVol;
  return { buyVol, sellVol, delta: buyVol - sellVol };
}

export function buildDeltaBars(candles: Candle[]): DeltaBar[] {
  if (!candles.length) return [];

  const vols = candles.map((c) => c.volume || 0);
  const ranges = candles.map((c) => Math.max(0, c.high - c.low));
  const meanVol = average(vols);
  const stdVol = stdev(vols, meanVol) || meanVol * 0.25 || 1;
  const meanRange = average(ranges.filter((r) => r > 0)) || 0;

  let cvd = 0;
  const out: DeltaBar[] = [];

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const { buyVol, sellVol, delta } = splitVolume(c);
    cvd += delta;
    const vol = c.volume || 0;
    const range = ranges[i];
    const bigPrint = vol > meanVol + 2 * stdVol && vol > 0;
    const absorption =
      meanVol > 0 &&
      meanRange > 0 &&
      vol >= meanVol * 1.6 &&
      range > 0 &&
      range <= meanRange * 0.55 &&
      Math.abs(delta) / vol < 0.35;

    out.push({
      time: c.time,
      volume: vol,
      delta,
      cvd,
      buyVol,
      sellVol,
      absorption,
      bigPrint,
    });
  }

  return out;
}

/**
 * Approximate session volume profile by spreading each bar's volume
 * across its high–low range (tick-less OHLC proxy).
 */
export function buildVolumeProfile(
  candles: Candle[],
  binCount = 24,
): VolumeProfile | null {
  if (candles.length < 3) return null;
  let lo = Infinity;
  let hi = -Infinity;
  for (const c of candles) {
    lo = Math.min(lo, c.low);
    hi = Math.max(hi, c.high);
  }
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi <= lo) return null;

  const step = (hi - lo) / binCount;
  if (step <= 0) return null;

  const bins: VolumeProfileBin[] = Array.from({ length: binCount }, (_, i) => ({
    price: lo + (i + 0.5) * step,
    volume: 0,
    buyVol: 0,
    sellVol: 0,
  }));

  for (const c of candles) {
    const { buyVol, sellVol } = splitVolume(c);
    const vol = c.volume || 0;
    if (vol <= 0) continue;
    const start = Math.max(0, Math.floor((c.low - lo) / step));
    const end = Math.min(binCount - 1, Math.floor((c.high - lo) / step));
    const span = end - start + 1;
    for (let i = start; i <= end; i++) {
      bins[i].volume += vol / span;
      bins[i].buyVol += buyVol / span;
      bins[i].sellVol += sellVol / span;
    }
  }

  const totalVolume = bins.reduce((s, b) => s + b.volume, 0);
  if (totalVolume <= 0) return null;

  let pocIdx = 0;
  for (let i = 1; i < bins.length; i++) {
    if (bins[i].volume > bins[pocIdx].volume) pocIdx = i;
  }

  // Value area ≈ 70% of volume expanding from POC
  const target = totalVolume * 0.7;
  let loIdx = pocIdx;
  let hiIdx = pocIdx;
  let covered = bins[pocIdx].volume;
  while (covered < target && (loIdx > 0 || hiIdx < bins.length - 1)) {
    const down = loIdx > 0 ? bins[loIdx - 1].volume : -1;
    const up = hiIdx < bins.length - 1 ? bins[hiIdx + 1].volume : -1;
    if (up >= down) {
      hiIdx += 1;
      covered += bins[hiIdx].volume;
    } else {
      loIdx -= 1;
      covered += bins[loIdx].volume;
    }
  }

  return {
    bins,
    poc: bins[pocIdx].price,
    vah: bins[hiIdx].price + step / 2,
    val: bins[loIdx].price - step / 2,
    totalVolume,
  };
}

export function analyzeSmartMoney(candles: Candle[]): SmartMoneySnapshot {
  const bars = buildDeltaBars(candles);
  const profile = buildVolumeProfile(candles);
  if (!bars.length) {
    return {
      cvd: 0,
      lastDelta: 0,
      divergence: "none",
      relativeVolume: 0,
      bigPrintCount: 0,
      absorptionCount: 0,
      profile: null,
      bars: [],
      score: 0,
      bias: "neutral",
      note: "Not enough session data",
    };
  }

  const last = bars[bars.length - 1];
  const first = candles[0];
  const lastC = candles[candles.length - 1];
  const priceChg = lastC.close - first.open;
  const cvd = last.cvd;

  let divergence: SmartMoneySnapshot["divergence"] = "none";
  if (priceChg > 0 && cvd < 0) divergence = "bearish";
  else if (priceChg < 0 && cvd > 0) divergence = "bullish";

  const vols = bars.map((b) => b.volume);
  const meanVol = average(vols) || 1;
  const recent = vols.slice(-6);
  const relativeVolume = average(recent) / meanVol;

  const bigPrintCount = bars.filter((b) => b.bigPrint).length;
  const absorptionCount = bars.filter((b) => b.absorption).length;

  const bias: Side | "neutral" =
    cvd > 0 && priceChg >= 0
      ? "bullish"
      : cvd < 0 && priceChg <= 0
        ? "bearish"
        : "neutral";

  // Composite 0–100 — OrderBlock customization (strength of tape proxy + structure)
  let score = 0;
  score += Math.min(35, (Math.abs(cvd) / (meanVol * bars.length || 1)) * 120);
  score += Math.min(20, Math.max(0, relativeVolume - 1) * 18);
  score += Math.min(20, bigPrintCount * 4);
  score += Math.min(15, absorptionCount * 5);
  if (divergence === "none" && bias !== "neutral") score += 10;
  if (divergence !== "none") score += 5;
  score = Math.round(Math.min(100, score));

  const noteParts: string[] = [];
  if (bias !== "neutral") noteParts.push(`${bias} tape bias`);
  if (divergence !== "none") noteParts.push(`${divergence} CVD divergence`);
  if (relativeVolume >= 1.4) noteParts.push("elevated RVOL");
  if (bigPrintCount) noteParts.push(`${bigPrintCount} big prints`);
  if (absorptionCount) noteParts.push(`${absorptionCount} absorption bars`);
  if (profile) noteParts.push(`POC ${profile.poc.toFixed(2)}`);

  return {
    cvd,
    lastDelta: last.delta,
    divergence,
    relativeVolume,
    bigPrintCount,
    absorptionCount,
    profile,
    bars,
    score,
    bias,
    note: noteParts.join(" · ") || "Quiet session tape",
  };
}

function average(xs: number[]) {
  if (!xs.length) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function stdev(xs: number[], mean: number) {
  if (xs.length < 2) return 0;
  const v = xs.reduce((s, x) => s + (x - mean) ** 2, 0) / (xs.length - 1);
  return Math.sqrt(v);
}
