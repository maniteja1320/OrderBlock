"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { FlowBoardResponse, FlowRow } from "@/lib/flowBoard";
import { isWeekdayMarketHours } from "@/lib/marketHours";
import { SectorPanel } from "@/components/terminal/SectorPanel";
import { StockSheet } from "@/components/terminal/StockSheet";

function formatConfirmTime(unixSec: number): string {
  return new Date(unixSec * 1000).toLocaleTimeString("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function FlowBoard({
  title,
  side,
  rows,
  selected,
  onSelect,
  highlightSector = null,
}: {
  title: string;
  side: "bullish" | "bearish";
  rows: FlowRow[];
  selected: string | null;
  onSelect: (symbol: string) => void;
  highlightSector?: string | null;
}) {
  const accent = side === "bullish" ? "text-emerald-600" : "text-red-600";
  const empty =
    side === "bullish"
      ? "No Terminal bullish names yet…"
      : "No Terminal bearish names yet…";
  const matchCount = highlightSector
    ? rows.filter((r) => r.sector === highlightSector).length
    : 0;

  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)]">
      <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
        <h2 className={`text-sm font-semibold ${accent}`}>{title}</h2>
        <span className="text-xs text-[var(--muted)]">
          {highlightSector
            ? `${matchCount} in ${highlightSector} · ${rows.filter((r) => r.obConfirmed).length} confirmed`
            : `${rows.filter((r) => r.obConfirmed).length} confirmed · ${rows.length}`}
        </span>
      </div>
      <ul className="divide-y divide-[var(--border)]">
        {rows.length === 0 && (
          <li className="px-4 py-8 text-center text-sm text-[var(--muted)]">
            {empty}
          </li>
        )}
        {rows.map((row) => {
          const active = selected === row.symbol;
          const sectorHit =
            highlightSector != null && row.sector === highlightSector;
          const sectorDim =
            highlightSector != null && row.sector !== highlightSector;
          return (
            <li key={row.symbol}>
              <button
                type="button"
                onClick={() => onSelect(row.symbol)}
                className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-[var(--surface-2)] ${
                  active ? "bg-[var(--surface-2)]" : ""
                } ${
                  sectorHit
                    ? "bg-[var(--accent)]/15 ring-1 ring-inset ring-[var(--accent)]/40"
                    : ""
                } ${sectorDim ? "opacity-35" : ""}`}
              >
                <span className="w-6 text-xs tabular-nums text-[var(--muted)]">
                  {String(row.rank).padStart(2, "0")}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{row.symbol}</div>
                  <div className="truncate text-xs text-[var(--muted)]">
                    {row.sector}
                    {" · "}
                    {row.obConfirmed && row.confirmTime != null
                      ? `OB @ ${formatConfirmTime(row.confirmTime)}`
                      : "no OB confirm"}
                    {" · "}
                    T#{row.terminalRank}
                  </div>
                </div>
                <div className="text-right">
                  <div
                    className={`text-sm font-medium tabular-nums ${
                      row.changePct >= 0 ? "text-emerald-600" : "text-red-600"
                    }`}
                  >
                    {row.changePct >= 0 ? "+" : ""}
                    {row.changePct.toFixed(2)}%
                  </div>
                  <div className="text-[10px] tabular-nums text-[var(--muted)]">
                    {row.last.toFixed(2)}
                  </div>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function FlowClient() {
  const [data, setData] = useState<FlowBoardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [highlightSector, setHighlightSector] = useState<string | null>(null);

  const load = useCallback(async (force = false) => {
    try {
      setError(null);
      const res = await fetch(`/api/flow${force ? "?force=1" : ""}`);
      if (!res.ok) throw new Error("fail");
      setData((await res.json()) as FlowBoardResponse);
    } catch {
      setError("Could not load flow board.");
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
    () =>
      data
        ? [...data.bullish, ...data.bearish].map((r) => r.symbol)
        : [],
    [data],
  );

  return (
    <div className="mx-auto max-w-7xl space-y-4 px-4 py-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Flow</h1>
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
            {data && (
              <>
                {" · "}
                {data.scanned} names · OB confirm sort
              </>
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={() => load(true)}
          className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--muted)] hover:text-[var(--fg)]"
        >
          Refresh
        </button>
      </div>

      {error && <p className="text-sm text-[var(--bear)]">{error}</p>}
      {loading && !data && (
        <p className="text-sm text-[var(--muted)]">
          Loading Terminal boards and OB confirmations…
        </p>
      )}

      {data && (
        <>
          <SectorPanel
            sectors={data.sectors}
            selectedSector={highlightSector}
            onSelectSector={setHighlightSector}
          />

          <div className="grid gap-4 lg:grid-cols-2">
            <FlowBoard
              title="Bullish · OB confirm"
              side="bullish"
              rows={data.bullish}
              selected={selected}
              onSelect={setSelected}
              highlightSector={highlightSector}
            />
            <FlowBoard
              title="Bearish · OB confirm"
              side="bearish"
              rows={data.bearish}
              selected={selected}
              onSelect={setSelected}
              highlightSector={highlightSector}
            />
          </div>
        </>
      )}

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
