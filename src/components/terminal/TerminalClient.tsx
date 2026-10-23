"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { isWeekdayMarketHours } from "@/lib/marketHours";
import type { RankingsResponse } from "@/lib/types";
import { Board } from "./Board";
import { BreadthBar } from "./BreadthBar";
import { MarketScatter } from "./MarketScatter";
import { SectorPanel } from "./SectorPanel";
import { StockSheet } from "./StockSheet";

export function TerminalClient() {
  const [data, setData] = useState<RankingsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [highlightSector, setHighlightSector] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const load = useCallback(async (force = false) => {
    try {
      setError(null);
      const res = await fetch(`/api/rankings${force ? "?force=1" : ""}`);
      if (!res.ok) throw new Error("Failed");
      const json = (await res.json()) as RankingsResponse;
      setData(json);
    } catch {
      setError("Could not refresh rankings. Retrying…");
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

  const boardSymbols = useMemo(() => {
    if (!data) return [];
    return [...data.bullish, ...data.bearish].map((r) => r.symbol);
  }, [data]);

  const searchHits = useMemo(() => {
    if (!data || !query.trim()) return [];
    const q = query.trim().toUpperCase();
    return data.all
      .filter((s) => s.symbol.includes(q))
      .slice(0, 8)
      .map((s) => s.symbol);
  }, [data, query]);

  const boardMeta = useMemo(() => {
    if (!data || !selected) return null;
    const bullIdx = data.bullish.findIndex((s) => s.symbol === selected);
    if (bullIdx >= 0) {
      const boardSize = data.bullish.length;
      const rank = bullIdx + 1;
      return {
        rank,
        boardSize,
        percentile: Math.round((1 - (rank - 1) / boardSize) * 1000) / 10,
        isPick: data.topPicks.some(
          (p) => p.symbol === selected && p.side === "bullish",
        ),
        boardSide: "bullish" as const,
      };
    }
    const bearIdx = data.bearish.findIndex((s) => s.symbol === selected);
    if (bearIdx >= 0) {
      const boardSize = data.bearish.length;
      const rank = bearIdx + 1;
      return {
        rank,
        boardSize,
        percentile: Math.round((1 - (rank - 1) / boardSize) * 1000) / 10,
        isPick: data.topPicks.some(
          (p) => p.symbol === selected && p.side === "bearish",
        ),
        boardSide: "bearish" as const,
      };
    }
    return null;
  }, [data, selected]);

  return (
    <div className="mx-auto max-w-7xl space-y-4 px-4 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Order Block Terminal</h1>
          <p className="text-sm text-[var(--muted)]">
            {data?.marketStatus.label ?? "Loading…"}
            {data?.updatedAt && (
              <>
                {" · "}
                refreshed{" "}
                {new Date(data.updatedAt).toLocaleTimeString("en-IN", {
                  timeZone: "Asia/Kolkata",
                  hour: "2-digit",
                  minute: "2-digit",
                })}{" "}
                IST
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search F&O stock"
              className="w-44 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-sm outline-none focus:border-[var(--accent)] sm:w-56"
            />
            {searchHits.length > 0 && (
              <ul className="absolute right-0 z-10 mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] shadow-lg">
                {searchHits.map((s) => (
                  <li key={s}>
                    <button
                      type="button"
                      className="block w-full px-3 py-2 text-left text-sm hover:bg-[var(--surface-2)]"
                      onClick={() => {
                        setSelected(s);
                        setQuery("");
                      }}
                    >
                      {s}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <button
            type="button"
            onClick={() => load(true)}
            className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm"
          >
            Refresh
          </button>
        </div>
      </div>

      {loading && !data && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-12 text-center text-sm text-[var(--muted)]">
          Scanning F&O universe with live Yahoo Finance data… first load can take
          30–90 seconds.
        </div>
      )}

      {error && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
          {error}
        </div>
      )}

      {data && (
        <>
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2 space-y-4">
              <MarketScatter data={data} />
              <BreadthBar breadth={data.breadth} />
            </div>
            <SectorPanel
              sectors={data.sectors}
              selectedSector={highlightSector}
              onSelectSector={setHighlightSector}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Board
              title="Bullish"
              side="bullish"
              rows={data.bullish}
              selected={selected}
              onSelect={setSelected}
              highlightSector={highlightSector}
            />
            <Board
              title="Bearish"
              side="bearish"
              rows={data.bearish}
              selected={selected}
              onSelect={setSelected}
              highlightSector={highlightSector}
            />
          </div>

          <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <h2 className="mb-3 text-sm font-semibold">Today&apos;s top picks</h2>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {data.topPicks.map((p) => (
                <button
                  key={`${p.side}-${p.symbol}`}
                  type="button"
                  onClick={() => setSelected(p.symbol)}
                  className="rounded-lg border border-[var(--border)] px-3 py-3 text-left hover:bg-[var(--surface-2)]"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{p.symbol}</span>
                    <span
                      className={
                        p.side === "bullish" ? "text-emerald-600" : "text-red-600"
                      }
                    >
                      #{p.rank} {p.side}
                    </span>
                  </div>
                  <div
                    className={`mt-1 text-sm ${
                      p.changePct >= 0 ? "text-emerald-600" : "text-red-600"
                    }`}
                  >
                    {p.changePct >= 0 ? "+" : ""}
                    {p.changePct.toFixed(2)}% · score {p.strength.toFixed(2)}
                  </div>
                </button>
              ))}
            </div>
          </section>
        </>
      )}

      <StockSheet
        symbol={selected}
        symbols={boardSymbols}
        boardMeta={boardMeta}
        onClose={() => setSelected(null)}
        onNavigate={setSelected}
      />
    </div>
  );
}
