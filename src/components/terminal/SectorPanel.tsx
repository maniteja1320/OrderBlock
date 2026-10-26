"use client";

import type { SectorFlow } from "@/lib/types";

export function SectorPanel({
  sectors,
  selectedSector = null,
  onSelectSector,
}: {
  sectors: SectorFlow[];
  selectedSector?: string | null;
  onSelectSector?: (sector: string | null) => void;
}) {
  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Sector flow</h2>
        {selectedSector && (
          <button
            type="button"
            onClick={() => onSelectSector?.(null)}
            className="text-[11px] text-[var(--muted)] hover:text-[var(--fg)]"
          >
            Clear
          </button>
        )}
      </div>
      <p className="mb-2 text-[11px] text-[var(--muted)]">
        Tap a sector to highlight its names on the boards
      </p>
      <ul className="max-h-80 space-y-1.5 overflow-auto text-sm">
        {sectors.map((s) => {
          const active = selectedSector === s.sector;
          return (
            <li key={s.sector}>
              <button
                type="button"
                onClick={() =>
                  onSelectSector?.(active ? null : s.sector)
                }
                className={`flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left transition hover:bg-[var(--surface-2)] ${
                  active
                    ? "bg-[var(--accent)]/15 ring-1 ring-[var(--accent)]/50"
                    : ""
                }`}
              >
                <span
                  className={`min-w-0 truncate ${active ? "font-medium" : ""}`}
                >
                  {s.sector}{" "}
                  <span className="tabular-nums text-emerald-600">
                    {s.bullishCount}↑
                  </span>{" "}
                  <span className="tabular-nums text-red-600">
                    {s.bearishCount}↓
                  </span>
                </span>
                <span
                  className={`shrink-0 tabular-nums ${
                    s.avgStrength > 0
                      ? "font-medium text-emerald-600"
                      : s.avgStrength < 0
                        ? "font-medium text-red-600"
                        : "text-[var(--muted)]"
                  }`}
                >
                  {s.avgStrength > 0 ? "+" : ""}
                  {s.avgStrength.toFixed(2)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
