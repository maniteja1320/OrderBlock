import { getMarketStatus } from "./marketHours";
import { todayCandles } from "./orderBlock";
import { computeRankings } from "./rankings";
import { pctPath, readStructure, type StructureRead } from "./structure";
import { INDEX_UNDERLYINGS, symbolMap } from "./symbols";
import type { Candle, Side } from "./types";
import { fetchIntraday1m, fetchIntraday5m, mapPool } from "./yahoo";

export interface IndexCard {
  id: string;
  label: string;
  last: number;
  changePct: number;
  structure: StructureRead;
  spark: number[];
}

export interface StructureCard {
  symbol: string;
  name: string;
  sector: string;
  last: number;
  changePct: number;
  strength: number;
  side: Side | "neutral";
  structure: StructureRead;
  spark: number[];
}

export interface SectorSeries {
  sector: string;
  changePct: number;
  points: Array<{ time: number; pct: number }>;
}

export interface StructureBoardResponse {
  updatedAt: string;
  marketStatus: ReturnType<typeof getMarketStatus>;
  indices: IndexCard[];
  leadingSector: { sector: string; changePct: number } | null;
  laggingSector: { sector: string; changePct: number } | null;
  breadth: { bullish: number; bearish: number };
  sectors: SectorSeries[];
  cards: StructureCard[];
}

let cache: { at: number; data: StructureBoardResponse } | null = null;

function sparkFrom(candles: Candle[], n = 18): number[] {
  const session = todayCandles(candles);
  const src = session.length ? session : candles.slice(-40);
  if (!src.length) return [];
  const step = Math.max(1, Math.floor(src.length / n));
  const out: number[] = [];
  for (let i = 0; i < src.length; i += step) out.push(src[i].close);
  const last = src[src.length - 1].close;
  if (out[out.length - 1] !== last) out.push(last);
  return out.slice(-n);
}

async function loadIndex(meta: (typeof INDEX_UNDERLYINGS)[number]): Promise<IndexCard | null> {
  try {
    const [{ candles: m1, previousClose, last }, m5] = await Promise.all([
      fetchIntraday1m(meta.yahoo),
      fetchIntraday5m(meta.yahoo),
    ]);
    const session5 = todayCandles(m5);
    const forStruct = session5.length ? session5 : m5.slice(-80);
    const structure = readStructure(forStruct);
    const px = last || m1[m1.length - 1]?.close || 0;
    const prev = previousClose || m1[0]?.open || px;
    const changePct = prev ? ((px - prev) / prev) * 100 : 0;
    return {
      id: meta.id,
      label: meta.label,
      last: px,
      changePct,
      structure,
      spark: sparkFrom(m1.length ? m1 : m5),
    };
  } catch {
    return null;
  }
}

export async function computeStructureBoard(
  force = false,
): Promise<StructureBoardResponse> {
  const now = Date.now();
  if (!force && cache && now - cache.at < 55_000) return cache.data;

  const rankings = await computeRankings(force);
  const boardSymbols = [
    ...rankings.bullish.map((r) => r.symbol),
    ...rankings.bearish.map((r) => r.symbol),
  ];
  const unique = [...new Set(boardSymbols)];

  const [indices, stockPacks] = await Promise.all([
    mapPool([...INDEX_UNDERLYINGS], 3, (m) => loadIndex(m)).then((xs) =>
      xs.filter((x): x is IndexCard => Boolean(x)),
    ),
    mapPool(unique, 10, async (symbol) => {
      const meta = symbolMap.get(symbol);
      if (!meta) return null;
      try {
        const [m5, quote] = await Promise.all([
          fetchIntraday5m(symbol),
          Promise.resolve(
            [...rankings.bullish, ...rankings.bearish].find(
              (r) => r.symbol === symbol,
            ),
          ),
        ]);
        const session = todayCandles(m5);
        const candles = session.length ? session : m5.slice(-80);
        const structure = readStructure(candles);
        return {
          symbol,
          name: meta.name,
          sector: meta.sector,
          last: quote?.last ?? candles[candles.length - 1]?.close ?? 0,
          changePct: quote?.changePct ?? 0,
          strength: quote?.strength ?? 0,
          side: quote?.side ?? "neutral",
          structure,
          spark: sparkFrom(candles),
          path: pctPath(candles),
        };
      } catch {
        return null;
      }
    }),
  ]);

  const packs = stockPacks.filter(Boolean) as Array<
    StructureCard & { path: Array<{ time: number; pct: number }> }
  >;

  // Sector series: average % path of board names in each sector
  const bySector = new Map<string, Array<Array<{ time: number; pct: number }>>>();
  for (const p of packs) {
    const list = bySector.get(p.sector) ?? [];
    list.push(p.path);
    bySector.set(p.sector, list);
  }

  const sectors: SectorSeries[] = [...bySector.entries()]
    .map(([sector, paths]) => {
      // Align by index (5m bars roughly same length)
      const len = Math.max(...paths.map((x) => x.length), 0);
      const points: Array<{ time: number; pct: number }> = [];
      for (let i = 0; i < len; i++) {
        let sum = 0;
        let n = 0;
        let t = 0;
        for (const path of paths) {
          const pt = path[Math.min(i, path.length - 1)];
          if (!pt) continue;
          sum += pt.pct;
          t = pt.time;
          n += 1;
        }
        if (n) points.push({ time: t, pct: sum / n });
      }
      const changePct = points[points.length - 1]?.pct ?? 0;
      return { sector, changePct, points };
    })
    .sort((a, b) => b.changePct - a.changePct);

  const leadingSector = sectors[0]
    ? { sector: sectors[0].sector, changePct: sectors[0].changePct }
    : rankings.leadingSector
      ? {
          sector: rankings.leadingSector.sector,
          changePct: rankings.leadingSector.avgStrength,
        }
      : null;
  const laggingSector = sectors[sectors.length - 1]
    ? {
        sector: sectors[sectors.length - 1].sector,
        changePct: sectors[sectors.length - 1].changePct,
      }
    : rankings.laggingSector
      ? {
          sector: rankings.laggingSector.sector,
          changePct: rankings.laggingSector.avgStrength,
        }
      : null;

  const cards: StructureCard[] = packs
    .map(({ path: _p, ...rest }) => rest)
    .sort((a, b) => {
      // Prefer names with a structure event, then |change|
      const ae = a.structure.event === "NONE" ? 0 : 1;
      const be = b.structure.event === "NONE" ? 0 : 1;
      if (be !== ae) return be - ae;
      return Math.abs(b.changePct) - Math.abs(a.changePct);
    });

  const data: StructureBoardResponse = {
    updatedAt: new Date().toISOString(),
    marketStatus: getMarketStatus(),
    indices,
    leadingSector,
    laggingSector,
    breadth: {
      bullish: rankings.breadth.up,
      bearish: rankings.breadth.down,
    },
    sectors,
    cards,
  };

  cache = { at: now, data };
  return data;
}
