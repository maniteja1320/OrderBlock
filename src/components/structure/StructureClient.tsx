"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { isWeekdayMarketHours } from "@/lib/marketHours";
import type { StructureBoardResponse, StructureCard } from "@/lib/structureBoard";
import { StockSheet } from "@/components/terminal/StockSheet";
import { SectorLinesChart } from "./SectorLinesChart";

function Spark({ values, up }: { values: number[]; up: boolean }) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const w = 64;
  const h = 22;
  const d = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * w;
      const y = h - ((v - min) / span) * h;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg width={w} height={h} className="opacity-80">
      <path d={d} fill="none" stroke={up ? "#22c55e" : "#ef4444"} strokeWidth={1.2} />
    </svg>
  );
}

function eventLabel(card: { structure: StructureCard["structure"] }) {
  const { event, direction, timeLabel } = card.structure;
  if (event === "NONE" || !direction) return "—";
  const arrow = direction === "up" ? "↑" : "↓";
  return `${event} ${arrow}${timeLabel ? ` ${timeLabel}` : ""}`;
}

function IndexTile({
  label,
  last,
  changePct,
  structure,
  spark,
}: StructureBoardResponse["indices"][number]) {
  const up = changePct >= 0;
  const liq =
    structure.liquidityPrice != null
      ? structure.liquiditySwept
        ? "LIQ swept"
        : "LIQ not swept"
      : "LIQ —";
  const dist =
    structure.distPct != null
      ? `${Math.abs(structure.distPct).toFixed(1)}% ${structure.distPct >= 0 ? "above" : "below"}`
      : "";

  return (
    <div
      className={`rounded-lg border px-3 py-2.5 ${
        up
          ? "border-emerald-500/30 bg-emerald-500/5"
          : "border-red-500/35 bg-red-500/10"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-[11px] font-semibold tracking-wide text-white/80">
            {label}
          </div>
          <div className="mt-0.5 text-lg font-semibold tabular-nums text-white">
            {last.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
          </div>
        </div>
        <div className="text-right">
          <div
            className={`text-sm font-semibold tabular-nums ${
              up ? "text-emerald-400" : "text-red-400"
            }`}
          >
            {up ? "+" : ""}
            {changePct.toFixed(2)}%
          </div>
          <Spark values={spark} up={up} />
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px]">
        <span
          className={`rounded px-1.5 py-0.5 font-semibold ${
            structure.direction === "up"
              ? "bg-emerald-500/20 text-emerald-300"
              : structure.direction === "down"
                ? "bg-red-500/20 text-red-300"
                : "bg-white/10 text-white/50"
          }`}
        >
          {eventLabel({ structure })}
        </span>
        <span className="text-white/45">{liq}</span>
        {dist && <span className="text-white/45">{dist}</span>}
        {structure.displacement && (
          <span className="text-amber-300/90">displacement</span>
        )}
      </div>
    </div>
  );
}

function StockTile({
  card,
  onSelect,
}: {
  card: StructureCard;
  onSelect: (s: string) => void;
}) {
  const up = card.changePct >= 0;
  const border =
    card.structure.event !== "NONE"
      ? card.structure.direction === "up"
        ? "border-emerald-400/50"
        : "border-red-400/50"
      : "border-white/10";

  return (
    <button
      type="button"
      onClick={() => onSelect(card.symbol)}
      className={`w-full rounded-md border ${border} bg-[#0c1018] px-2.5 py-2 text-left transition hover:bg-[#121826]`}
    >
      <div className="flex items-center justify-between gap-1">
        <span className="truncate text-xs font-semibold text-white">
          {card.symbol}
        </span>
        <span
          className={`text-[11px] font-semibold tabular-nums ${
            up ? "text-emerald-400" : "text-red-400"
          }`}
        >
          {up ? "+" : ""}
          {card.changePct.toFixed(2)}%
        </span>
      </div>
      <div className="mt-0.5 flex items-center justify-between gap-1">
        <span className="text-[11px] tabular-nums text-white/70">
          {card.last.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
        </span>
        <Spark values={card.spark} up={up} />
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[9px]">
        <span
          className={`rounded px-1 py-0.5 font-semibold ${
            card.structure.direction === "up"
              ? "bg-emerald-500/15 text-emerald-300"
              : card.structure.direction === "down"
                ? "bg-red-500/15 text-red-300"
                : "bg-white/5 text-white/40"
          }`}
        >
          {eventLabel(card)}
        </span>
        {!card.structure.liquiditySwept && card.structure.liquidityPrice != null && (
          <span className="text-white/35">LIQ hold</span>
        )}
        {card.structure.liquiditySwept && (
          <span className="text-white/35">LIQ swept</span>
        )}
      </div>
    </button>
  );
}

export function StructureClient() {
  const [data, setData] = useState<StructureBoardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const load = useCallback(async (force = false) => {
    try {
      setError(null);
      const res = await fetch(`/api/structure${force ? "?force=1" : ""}`);
      if (!res.ok) throw new Error("fail");
      setData((await res.json()) as StructureBoardResponse);
    } catch {
      setError("Could not load structure board.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(true);
    const id = setInterval(() => {
      if (isWeekdayMarketHours()) load(false);
    }, 60_000);
    return () => clearInterval(id);
  }, [load]);

  const symbols = useMemo(
    () => data?.cards.map((c) => c.symbol) ?? [],
    [data],
  );

  const statusLine = data?.marketStatus.label ?? "Loading…";
  const refreshedLine = data?.updatedAt
    ? `refreshed ${new Date(data.updatedAt).toLocaleTimeString("en-IN", {
        timeZone: "Asia/Kolkata",
        hour: "2-digit",
        minute: "2-digit",
      })} IST`
    : null;

  return (
    <div className="min-h-[calc(100vh-3.5rem)] bg-[#05070c] text-white">
      <div className="mx-auto max-w-[1400px] px-3 py-4 sm:px-4">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h1 className="text-lg font-semibold tracking-[0.18em] text-white/90">
              SMART MONEY
            </h1>
            <p className="mt-1 max-w-3xl text-[11px] text-white/45">
              Every F&amp;O stock and NIFTY, BANKNIFTY, SENSEX: displacement,
              structure, zones and liquidity — BOS / CHOCH from 5m swings
            </p>
            <p className="mt-1 text-[11px] text-white/50">
              {statusLine}
              {refreshedLine && <> · {refreshedLine}</>}
            </p>
          </div>
          <div className="flex items-center gap-3 text-[11px] text-white/50">
            <button
              type="button"
              onClick={() => load(true)}
              className="rounded border border-white/15 px-2 py-1 hover:border-white/30 hover:text-white"
            >
              Refresh
            </button>
          </div>
        </div>

        {error && (
          <p className="mb-3 text-xs text-red-400">{error}</p>
        )}
        {loading && !data && (
          <p className="text-sm text-white/40">Building structure board…</p>
        )}

        {data && (
          <>
            <div className="grid gap-2 md:grid-cols-3">
              {data.indices.map((ix) => (
                <IndexTile key={ix.id} {...ix} />
              ))}
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px]">
              <div className="flex flex-wrap gap-3">
                {data.laggingSector && (
                  <span className="font-semibold uppercase tracking-wide text-red-400">
                    Lagging sector {data.laggingSector.sector}{" "}
                    {data.laggingSector.changePct >= 0 ? "+" : ""}
                    {data.laggingSector.changePct.toFixed(2)}%
                  </span>
                )}
                {data.leadingSector && (
                  <span className="font-semibold uppercase tracking-wide text-emerald-400">
                    Leading sector {data.leadingSector.sector}{" "}
                    {data.leadingSector.changePct >= 0 ? "+" : ""}
                    {data.leadingSector.changePct.toFixed(2)}%
                  </span>
                )}
              </div>
              <span className="tabular-nums text-white/55">
                <span className="text-emerald-400">
                  Bullish {data.breadth.bullish}
                </span>
                {" / "}
                <span className="text-red-400">
                  Bearish {data.breadth.bearish}
                </span>
              </span>
            </div>

            <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
              <div className="overflow-hidden rounded-lg border border-white/10 bg-[#070a10]">
                <SectorLinesChart sectors={data.sectors} height={360} />
              </div>
              <div className="grid max-h-[360px] grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">
                {data.cards.map((card) => (
                  <StockTile
                    key={card.symbol}
                    card={card}
                    onSelect={setSelected}
                  />
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {selected && (
        <StockSheet
          symbol={selected}
          symbols={symbols}
          onClose={() => setSelected(null)}
          onNavigate={setSelected}
        />
      )}
    </div>
  );
}
