"use client";

import type { RankedStock, Side } from "@/lib/types";

interface Props {
  title: string;
  side: Side;
  rows: RankedStock[];
  onSelect: (symbol: string) => void;
  selected?: string | null;
  /** When set, highlight board rows in this sector and dim the rest. */
  highlightSector?: string | null;
}

export function Board({
  title,
  side,
  rows,
  onSelect,
  selected,
  highlightSector = null,
}: Props) {
  const accent = side === "bullish" ? "text-emerald-600" : "text-red-600";
  const matchCount = highlightSector
    ? rows.filter((r) => r.sector === highlightSector).length
    : 0;

  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)]">
      <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
        <h2 className={`text-sm font-semibold ${accent}`}>{title}</h2>
        <span className="text-xs text-[var(--muted)]">
          {highlightSector
            ? `${matchCount} in ${highlightSector} · Top ${rows.length}`
            : `Top ${rows.length}`}
        </span>
      </div>
      <ul className="divide-y divide-[var(--border)]">
        {rows.length === 0 && (
          <li className="px-4 py-8 text-center text-sm text-[var(--muted)]">
            Waiting for one-directional strength…
          </li>
        )}
        {rows.map((row) => {
          const active = selected === row.symbol;
          const entering = row.rank <= 10 && row.rankChange > 0;
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
                } ${entering && !highlightSector ? "animate-pulse bg-amber-500/10" : ""} ${
                  sectorHit
                    ? "bg-[var(--accent)]/15 ring-1 ring-inset ring-[var(--accent)]/40"
                    : ""
                } ${sectorDim ? "opacity-35" : ""}`}
              >
                <span className="w-6 text-xs tabular-nums text-[var(--muted)]">
                  {String(row.rank).padStart(2, "0")}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium">{row.symbol}</span>
                    {row.rankChange !== 0 && (
                      <span
                        className={`text-[10px] ${
                          row.rankChange > 0 ? "text-emerald-600" : "text-red-600"
                        }`}
                      >
                        {row.rankChange > 0 ? "▲" : "▼"}
                        {Math.abs(row.rankChange)}
                      </span>
                    )}
                  </div>
                  <div className="truncate text-xs text-[var(--muted)]">
                    {row.sector} · score {row.strength.toFixed(2)}
                  </div>
                </div>
                <span
                  className={`text-sm font-medium tabular-nums ${
                    row.changePct >= 0 ? "text-emerald-600" : "text-red-600"
                  }`}
                >
                  {row.changePct >= 0 ? "+" : ""}
                  {row.changePct.toFixed(2)}%
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
