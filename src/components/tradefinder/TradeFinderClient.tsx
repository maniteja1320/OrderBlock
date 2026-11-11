"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { isWeekdayMarketHours } from "@/lib/marketHours";
import type { RFactorBoardResponse, RFactorRow } from "@/lib/rFactorBoard";
import { StockSheet } from "@/components/terminal/StockSheet";

function formatVol(v: number): string {
  if (v >= 1e7) return `${(v / 1e7).toFixed(2)} Cr`;
  if (v >= 1e5) return `${(v / 1e5).toFixed(2)} L`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)} K`;
  return String(Math.round(v));
}

function sectorDomId(sector: string): string {
  return `tf-sector-${sector.replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase()}`;
}

interface SectorGroup {
  sector: string;
  rows: RFactorRow[];
  maxScore: number;
  avgScore: number;
  /** Avg day % change — used to rank sectors bullish → bearish (not Terminal strength). */
  avgChangePct: number;
  upCount: number;
  downCount: number;
}

function RowCells({
  row,
  selected,
  onSelect,
}: {
  row: RFactorRow;
  selected: string | null;
  onSelect: (symbol: string) => void;
}) {
  const active = selected === row.symbol;
  return (
    <tr
      onClick={() => onSelect(row.symbol)}
      className={`cursor-pointer transition hover:bg-[var(--surface-2)] ${
        active ? "bg-[var(--surface-2)]" : ""
      }`}
    >
      <td className="px-3 py-2 tabular-nums text-[var(--muted)]">
        {String(row.rank).padStart(2, "0")}
      </td>
      <td className="px-3 py-2 font-medium">{row.symbol}</td>
      <td className="px-3 py-2 text-right tabular-nums">{row.last.toFixed(2)}</td>
      <td
        className={`px-3 py-2 text-right tabular-nums ${
          row.changePct >= 0 ? "text-emerald-600" : "text-red-600"
        }`}
      >
        {row.changePct >= 0 ? "+" : ""}
        {row.changePct.toFixed(2)}%
      </td>
      <td className="px-3 py-2 text-right tabular-nums text-[var(--muted)]">
        {formatVol(row.volume)}
      </td>
      <td className="px-3 py-2 text-right tabular-nums">
        {row.relVol.toFixed(2)}×
      </td>
      <td className="px-3 py-2 text-right tabular-nums text-[var(--muted)]">
        {(row.relRange * 100).toFixed(2)}%
      </td>
      <td className="px-3 py-2 text-right font-semibold tabular-nums text-[var(--accent)]">
        {row.rScore.toFixed(1)}
      </td>
    </tr>
  );
}

export function TradeFinderClient() {
  const [data, setData] = useState<RFactorBoardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [activeSector, setActiveSector] = useState<string | null>(null);
  const [q, setQ] = useState("");

  const load = useCallback(async (force = false) => {
    try {
      setError(null);
      const res = await fetch(`/api/tradefinder${force ? "?force=1" : ""}`);
      const json = (await res.json()) as RFactorBoardResponse & {
        error?: string;
      };
      if (!res.ok && !json.rows) {
        throw new Error(json.error || "Failed to load R-factor board");
      }
      setData(json);
      if (json.error) setError(json.error);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not refresh TradeFinder board.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(true);
    const id = setInterval(() => {
      if (isWeekdayMarketHours()) void load(false);
    }, 60_000);
    return () => clearInterval(id);
  }, [load]);

  const filtered = useMemo(() => {
    const rows = data?.rows ?? [];
    const needle = q.trim().toUpperCase();
    if (!needle) return rows;
    return rows.filter(
      (r) =>
        r.symbol.includes(needle) ||
        r.name.toUpperCase().includes(needle) ||
        r.sector.toUpperCase().includes(needle),
    );
  }, [data, q]);

  const bySector = useMemo((): SectorGroup[] => {
    const map = new Map<string, RFactorRow[]>();
    for (const row of filtered) {
      const list = map.get(row.sector) ?? [];
      list.push(row);
      map.set(row.sector, list);
    }
    return [...map.entries()]
      .map(([sector, rows]) => {
        const sorted = [...rows].sort(
          (a, b) => b.rScore - a.rScore || b.relVol - a.relVol,
        );
        const maxScore = sorted[0]?.rScore ?? 0;
        const avgScore =
          sorted.length > 0
            ? sorted.reduce((s, r) => s + r.rScore, 0) / sorted.length
            : 0;
        const avgChangePct =
          sorted.length > 0
            ? sorted.reduce((s, r) => s + r.changePct, 0) / sorted.length
            : 0;
        const upCount = sorted.filter((r) => r.changePct > 0.05).length;
        const downCount = sorted.filter((r) => r.changePct < -0.05).length;
        return {
          sector,
          rows: sorted,
          maxScore,
          avgScore,
          avgChangePct,
          upCount,
          downCount,
        };
      })
      // Bullish → bearish by avg day % change (not Terminal strength, not R-score).
      .sort(
        (a, b) =>
          b.avgChangePct - a.avgChangePct ||
          b.upCount - b.downCount - (a.upCount - a.downCount) ||
          a.sector.localeCompare(b.sector),
      );
  }, [filtered]);

  const scrollToSector = useCallback((sector: string) => {
    setActiveSector(sector);
    const el = document.getElementById(sectorDomId(sector));
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const boardSymbols = useMemo(
    () => (data?.rows ?? []).map((r) => r.symbol),
    [data],
  );

  return (
    <div className="mx-auto max-w-7xl space-y-4 px-4 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">TradeFinder</h1>
          <p className="text-sm text-[var(--muted)]">
            R-Factor · Upstox · sector flow by avg % change
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
          {data && (
            <p className="mt-1 text-xs text-[var(--muted)]">
              Universe {data.universe} · scored {data.scored} · sectors{" "}
              {bySector.length}
              {data.marketStatus?.label ? ` · ${data.marketStatus.label}` : ""}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filter symbol / sector…"
            className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-[var(--accent)]"
          />
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              void load(true);
            }}
            className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--muted)] hover:text-[var(--fg)]"
          >
            {loading ? "Loading…" : "Refresh"}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
          {error}
        </div>
      )}

      {/* Sector list: bullish → bearish by avg % chg (not Terminal strength) */}
      <section className="sticky top-14 z-30 rounded-xl border border-[var(--border)] bg-[var(--surface)]/95 p-3 shadow-sm backdrop-blur">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Sectors</h2>
          <p className="text-[11px] text-[var(--muted)]">
            Bullish → bearish by avg day % · click to jump
          </p>
        </div>
        {bySector.length === 0 ? (
          <p className="py-4 text-center text-sm text-[var(--muted)]">
            {loading ? "Loading sectors…" : "No sectors yet"}
          </p>
        ) : (
          <ul className="max-h-56 space-y-1 overflow-auto pr-1 text-sm">
            {bySector.map((g, i) => {
              const active = activeSector === g.sector;
              return (
                <li key={g.sector}>
                  <button
                    type="button"
                    onClick={() => scrollToSector(g.sector)}
                    className={`flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left transition hover:bg-[var(--surface-2)] ${
                      active
                        ? "bg-[var(--accent)]/15 ring-1 ring-[var(--accent)]/50"
                        : ""
                    }`}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="w-5 shrink-0 tabular-nums text-[11px] text-[var(--muted)]">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span
                        className={`truncate ${active ? "font-medium" : ""}`}
                      >
                        {g.sector}{" "}
                        <span className="tabular-nums text-emerald-600">
                          {g.upCount}↑
                        </span>{" "}
                        <span className="tabular-nums text-red-600">
                          {g.downCount}↓
                        </span>
                      </span>
                    </span>
                    <span
                      className={`shrink-0 tabular-nums ${
                        g.avgChangePct > 0
                          ? "font-medium text-emerald-600"
                          : g.avgChangePct < 0
                            ? "font-medium text-red-600"
                            : "text-[var(--muted)]"
                      }`}
                    >
                      {g.avgChangePct > 0 ? "+" : ""}
                      {g.avgChangePct.toFixed(2)}%
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <p className="text-xs text-[var(--muted)]">
        Stock blocks follow the same bullish→bearish sector order · names inside
        each sector ranked by R-score (
        <a
          href="https://tradefinder.in"
          target="_blank"
          rel="noreferrer"
          className="underline hover:text-[var(--fg)]"
        >
          tradefinder.in
        </a>
        ).
      </p>

      {bySector.length === 0 && !loading && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-10 text-center text-sm text-[var(--muted)]">
          No rows yet
        </div>
      )}

      <div className="space-y-4">
        {bySector.map((group) => (
          <section
            key={group.sector}
            id={sectorDomId(group.sector)}
            className={`scroll-mt-72 overflow-hidden rounded-xl border bg-[var(--surface)] ${
              activeSector === group.sector
                ? "border-[var(--accent)]/60 ring-1 ring-[var(--accent)]/30"
                : "border-[var(--border)]"
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] bg-[var(--surface-2)] px-4 py-2.5">
              <h2 className="text-sm font-semibold">{group.sector}</h2>
              <div className="flex items-center gap-3 text-xs text-[var(--muted)]">
                <span>{group.rows.length} names</span>
                <span
                  className={`tabular-nums ${
                    group.avgChangePct >= 0
                      ? "text-emerald-600"
                      : "text-red-600"
                  }`}
                >
                  avg {group.avgChangePct >= 0 ? "+" : ""}
                  {group.avgChangePct.toFixed(2)}%
                </span>
                <span>
                  R top{" "}
                  <span className="font-semibold tabular-nums text-[var(--accent)]">
                    {group.maxScore.toFixed(1)}
                  </span>
                </span>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-left text-sm">
                <thead className="border-b border-[var(--border)] text-xs text-[var(--muted)]">
                  <tr>
                    <th className="px-3 py-2 font-medium">#</th>
                    <th className="px-3 py-2 font-medium">Symbol</th>
                    <th className="px-3 py-2 text-right font-medium">LTP</th>
                    <th className="px-3 py-2 text-right font-medium">% Chg</th>
                    <th className="px-3 py-2 text-right font-medium">Volume</th>
                    <th className="px-3 py-2 text-right font-medium">Rel Vol</th>
                    <th className="px-3 py-2 text-right font-medium">Range %</th>
                    <th className="px-3 py-2 text-right font-medium">R-Score</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {group.rows.map((row) => (
                    <RowCells
                      key={row.symbol}
                      row={row}
                      selected={selected}
                      onSelect={setSelected}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </div>

      <StockSheet
        symbol={selected}
        symbols={boardSymbols}
        onClose={() => setSelected(null)}
        onNavigate={setSelected}
      />
    </div>
  );
}
