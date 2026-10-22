import type { Candle, LevelMark, OrderBlockZone, Side } from "./types";

function isBull(c: Candle) {
  return c.close >= c.open;
}

function isBear(c: Candle) {
  return c.close < c.open;
}

/** Drop the still-forming last bar so confirmation uses closed candles only. */
function closedCandles(candles: Candle[]): Candle[] {
  if (candles.length < 2) return candles;
  const last = candles[candles.length - 1];
  const ageSec = Date.now() / 1000 - last.time;
  // 5m bar still open if less than ~4m50s old from its start timestamp
  if (ageSec < 5 * 60 - 10) {
    return candles.slice(0, -1);
  }
  return candles;
}

function bullZone(ob: Candle) {
  return {
    top: Math.max(ob.open, ob.close),
    bottom: Math.min(ob.low, ob.open, ob.close),
  };
}

function bearZone(ob: Candle) {
  return {
    top: Math.max(ob.high, ob.open, ob.close),
    bottom: Math.min(ob.open, ob.close),
  };
}

/**
 * Detect order blocks on finished 5m candles.
 *
 * Confirmed: last opposite candle + a later candle closes beyond the zone.
 * Unconfirmed: latest opposite candle(s) not yet closed beyond — shown dotted.
 */
export function detectOrderBlocks(candles: Candle[], side: Side): OrderBlockZone[] {
  const bars = closedCandles(candles);
  if (bars.length < 2) return [];

  const confirmed: OrderBlockZone[] = [];
  const confirmedAt = new Set<number>();

  for (let j = 1; j < bars.length; j++) {
    const confirm = bars[j];

    if (side === "bullish") {
      let i = j - 1;
      while (i >= 0 && !isBear(bars[i])) i--;
      if (i < 0) continue;

      const ob = bars[i];
      if (confirmedAt.has(ob.time)) continue;

      const { top, bottom } = bullZone(ob);
      if (confirm.close > top) {
        confirmedAt.add(ob.time);
        confirmed.push({
          side: "bullish",
          top,
          bottom,
          time: ob.time,
          label: "Z",
          confirmed: true,
          confirmTime: confirm.time,
          isCurrent: false,
        });
      }
    }

    if (side === "bearish") {
      let i = j - 1;
      while (i >= 0 && !isBull(bars[i])) i--;
      if (i < 0) continue;

      const ob = bars[i];
      if (confirmedAt.has(ob.time)) continue;

      const { top, bottom } = bearZone(ob);
      if (confirm.close < bottom) {
        confirmedAt.add(ob.time);
        confirmed.push({
          side: "bearish",
          top,
          bottom,
          time: ob.time,
          label: "Z",
          confirmed: true,
          confirmTime: confirm.time,
          isCurrent: false,
        });
      }
    }
  }

  // Unconfirmed candidates from full series (includes forming bar) — max 2
  const candidates: OrderBlockZone[] = [];
  const search = candles.length ? candles : bars;

  if (side === "bullish") {
    for (let i = search.length - 1; i >= 0 && candidates.length < 2; i--) {
      if (!isBear(search[i])) continue;
      const ob = search[i];
      if (confirmedAt.has(ob.time)) continue;
      const { top, bottom } = bullZone(ob);
      const broken = bars.some((b) => b.time > ob.time && b.close > top);
      if (broken) continue;
      candidates.push({
        side: "bullish",
        top,
        bottom,
        time: ob.time,
        label: "Z",
        confirmed: false,
        isCurrent: false,
      });
    }
  }

  if (side === "bearish") {
    for (let i = search.length - 1; i >= 0 && candidates.length < 2; i--) {
      if (!isBull(search[i])) continue;
      const ob = search[i];
      if (confirmedAt.has(ob.time)) continue;
      const { top, bottom } = bearZone(ob);
      const broken = bars.some((b) => b.time > ob.time && b.close < bottom);
      if (broken) continue;
      candidates.push({
        side: "bearish",
        top,
        bottom,
        time: ob.time,
        label: "Z",
        confirmed: false,
        isCurrent: false,
      });
    }
  }

  // Latest confirmed is "current"; if none, latest candidate is watch focus
  if (confirmed.length) {
    confirmed[confirmed.length - 1] = {
      ...confirmed[confirmed.length - 1],
      isCurrent: true,
    };
  } else if (candidates.length) {
    candidates[0] = { ...candidates[0], isCurrent: true };
  }

  // Confirmed first (chronological), then candidates (newest first already)
  return [...confirmed, ...candidates];
}

/** Band thickness around a liquidity price (~0.12% of price, min tiny). */
function liqBand(price: number): { top: number; bottom: number } {
  const pad = Math.max(price * 0.0012, price * 0.0004);
  return { top: price + pad, bottom: price - pad };
}

function dedupeLevels(raw: LevelMark[]): LevelMark[] {
  raw.sort((a, b) => (a.time ?? 0) - (b.time ?? 0));
  const uniq: LevelMark[] = [];
  for (const lv of raw) {
    if (uniq.every((u) => Math.abs(u.price - lv.price) / lv.price > 0.001)) {
      uniq.push(lv);
    }
  }
  return uniq;
}

/**
 * Liquidity: swing highs & lows of the session (3-bar + 5-bar pivots),
 * plus session high/low. Untaken = no later candle closed beyond.
 */
export function findLiquidityLevels(
  candles: Candle[],
  side: Side,
): LevelMark[] {
  if (candles.length < 3) return [];
  const raw: LevelMark[] = [];

  for (let i = 1; i < candles.length - 1; i++) {
    const c = candles[i];
    const left = candles[i - 1];
    const right = candles[i + 1];

    // 3-bar pivots (enough to catch session structure for R1/R2 / S1/S2)
    const isSwingHigh = c.high >= left.high && c.high >= right.high;
    const isSwingLow = c.low <= left.low && c.low <= right.low;

    if (isSwingHigh) {
      const taken = candles.slice(i + 1).some((x) => x.close > c.high);
      const band = liqBand(c.high);
      raw.push({
        price: c.high,
        top: band.top,
        bottom: band.bottom,
        time: c.time,
        label: "L",
        kind: "liquidity",
        swing: "high",
        taken,
      });
    }
    if (isSwingLow) {
      const taken = candles.slice(i + 1).some((x) => x.close < c.low);
      const band = liqBand(c.low);
      raw.push({
        price: c.low,
        top: band.top,
        bottom: band.bottom,
        time: c.time,
        label: "L",
        kind: "liquidity",
        swing: "low",
        taken,
      });
    }
  }

  // Session high / low as liquidity (day's high / low)
  let hiIdx = 0;
  let loIdx = 0;
  for (let i = 1; i < candles.length; i++) {
    if (candles[i].high > candles[hiIdx].high) hiIdx = i;
    if (candles[i].low < candles[loIdx].low) loIdx = i;
  }
  const dayHigh = candles[hiIdx].high;
  const dayLow = candles[loIdx].low;
  if (raw.every((u) => Math.abs(u.price - dayHigh) / dayHigh > 0.001)) {
    raw.push({
      price: dayHigh,
      ...liqBand(dayHigh),
      time: candles[hiIdx].time,
      label: "L",
      kind: "liquidity",
      swing: "high",
      taken: candles.slice(hiIdx + 1).some((x) => x.close > dayHigh),
    });
  }
  if (raw.every((u) => Math.abs(u.price - dayLow) / dayLow > 0.001)) {
    raw.push({
      price: dayLow,
      ...liqBand(dayLow),
      time: candles[loIdx].time,
      label: "L",
      kind: "liquidity",
      swing: "low",
      taken: candles.slice(loIdx + 1).some((x) => x.close < dayLow),
    });
  }

  const uniq = dedupeLevels(raw);
  const last = candles[candles.length - 1].close;
  const ahead = uniq.filter((l) =>
    side === "bullish" ? !l.taken && l.price > last : !l.taken && l.price < last,
  );
  ahead.sort((a, b) =>
    side === "bullish" ? a.price - b.price : b.price - a.price,
  );
  const rest = uniq.filter((l) => !ahead.includes(l));
  return [...ahead, ...rest];
}

/**
 * Next liquidity ahead of a reference price (order-block.com):
 * swing highs / day's high not closed beyond, or opposing block (bull);
 * swing lows / day's low, or opposing block (bear).
 */
function aheadTargets(
  swings: LevelMark[],
  side: Side,
  refPrice: number,
  opposing: OrderBlockZone[] = [],
): LevelMark[] {
  const fromSwings =
    side === "bullish"
      ? swings
          .filter((l) => l.swing === "high" && !l.taken && l.price > refPrice)
          .sort((a, b) => a.price - b.price)
      : swings
          .filter((l) => l.swing === "low" && !l.taken && l.price < refPrice)
          .sort((a, b) => b.price - a.price);

  const fromBlocks: LevelMark[] = opposing
    .filter((z) =>
      side === "bullish" ? z.bottom > refPrice : z.top < refPrice,
    )
    .sort((a, b) =>
      side === "bullish" ? a.bottom - b.bottom : b.top - a.top,
    )
    .map((z) => {
      const price = side === "bullish" ? z.bottom : z.top;
      return {
        price,
        top: z.top,
        bottom: z.bottom,
        time: z.time,
        label: "L" as const,
        kind: "liquidity" as const,
        swing: (side === "bullish" ? "high" : "low") as "high" | "low",
        taken: false,
      };
    });

  // Merge by price proximity, keep nearest first
  const merged: LevelMark[] = [];
  for (const lv of [...fromSwings, ...fromBlocks].sort((a, b) =>
    side === "bullish" ? a.price - b.price : b.price - a.price,
  )) {
    if (merged.every((u) => Math.abs(u.price - lv.price) / lv.price > 0.001)) {
      merged.push(lv);
    }
    if (merged.length >= 2) break;
  }

  // Last resort: still-above/below ref even if previously swept (price left them)
  if (merged.length < 2) {
    const loose =
      side === "bullish"
        ? swings
            .filter((l) => l.swing === "high" && l.price > refPrice)
            .sort((a, b) => a.price - b.price)
        : swings
            .filter((l) => l.swing === "low" && l.price < refPrice)
            .sort((a, b) => b.price - a.price);
    for (const lv of loose) {
      if (merged.every((u) => Math.abs(u.price - lv.price) / lv.price > 0.001)) {
        merged.push(lv);
      }
      if (merged.length >= 2) break;
    }
  }

  return merged.slice(0, 2);
}

/**
 * Levels for popup + chart.
 * Each confirmed OB gets interval segments (not full-day lines):
 * - Bullish: S1 invalidation + R1/R2 targets ahead
 * - Bearish: R1 invalidation + S1/S2 targets ahead
 * Span = that OB → next OB (or session end).
 */
export function buildLevels(
  zone: OrderBlockZone | undefined,
  candles: Candle[],
  side: Side,
  allZones: OrderBlockZone[] = [],
): LevelMark[] {
  const levels: LevelMark[] = [];
  const sessionEnd = candles[candles.length - 1]?.time;
  const lastClose = candles[candles.length - 1]?.close;
  if (!sessionEnd || lastClose == null) return levels;

  const setups = (allZones.length ? allZones : zone ? [zone] : [])
    .filter((z) => z.confirmed || z.isCurrent)
    .sort((a, b) => a.time - b.time);

  const swings = findLiquidityLevels(candles, side);
  // Mirror zones as opposing blocks for targets (bull uses bearish OBs ahead, etc.)
  const mirrorSide: Side = side === "bullish" ? "bearish" : "bullish";
  const opposing = detectOrderBlocks(candles, mirrorSide).filter(
    (z) => z.confirmed,
  );

  for (let i = 0; i < setups.length; i++) {
    const z = setups[i];
    const pad = Math.max((z.top - z.bottom) * 0.35, z.bottom * 0.001);
    const endTime = setups[i + 1]?.time ?? sessionEnd;
    const isCurrent = Boolean(z.isCurrent) || i === setups.length - 1;

    // Current setup: liquidity still ahead of live price.
    // Older setups: liquidity that was ahead of the zone when it formed.
    const ref = isCurrent
      ? lastClose
      : side === "bullish"
        ? z.top
        : z.bottom;

    if (side === "bullish") {
      const s1 = z.bottom - pad;
      levels.push({
        price: s1,
        top: s1,
        bottom: s1,
        time: z.time,
        endTime,
        label: "S1",
        kind: "invalidation",
        isCurrent,
      });

      const targets = aheadTargets(swings, "bullish", ref, opposing);
      if (targets[0]) {
        levels.push({
          price: targets[0].price,
          top: targets[0].top,
          bottom: targets[0].bottom,
          time: z.time,
          endTime,
          label: "R1",
          kind: "resistance",
          swing: "high",
          isCurrent,
        });
      }
      if (targets[1]) {
        levels.push({
          price: targets[1].price,
          top: targets[1].top,
          bottom: targets[1].bottom,
          time: z.time,
          endTime,
          label: "R2",
          kind: "resistance",
          swing: "high",
          isCurrent,
        });
      }
    } else {
      const r1Inv = z.top + pad;
      levels.push({
        price: r1Inv,
        top: r1Inv,
        bottom: r1Inv,
        time: z.time,
        endTime,
        label: "R1",
        kind: "invalidation",
        isCurrent,
      });

      const targets = aheadTargets(swings, "bearish", ref, opposing);
      if (targets[0]) {
        levels.push({
          price: targets[0].price,
          top: targets[0].top,
          bottom: targets[0].bottom,
          time: z.time,
          endTime,
          label: "S1",
          kind: "support",
          swing: "low",
          isCurrent,
        });
      }
      if (targets[1]) {
        levels.push({
          price: targets[1].price,
          top: targets[1].top,
          bottom: targets[1].bottom,
          time: z.time,
          endTime,
          label: "S2",
          kind: "support",
          swing: "low",
          isCurrent,
        });
      }
    }
  }

  return levels;
}

export function todayCandles(candles: Candle[]): Candle[] {
  if (!candles.length) return [];
  const lastDay = new Date(candles[candles.length - 1].time * 1000);
  const key = lastDay.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  return candles.filter((c) => {
    const d = new Date(c.time * 1000).toLocaleDateString("en-CA", {
      timeZone: "Asia/Kolkata",
    });
    return d === key;
  });
}
