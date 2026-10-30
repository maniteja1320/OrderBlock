"use client";

import { useCallback, useMemo, useState } from "react";
import {
  BEARISH_CONDITIONS,
  BULLISH_CONDITIONS,
} from "@/lib/expansionConditions";
import type {
  ExpansionHit,
  ExpansionSideResponse,
} from "@/lib/expansionScan";
import { StockSheet } from "@/components/terminal/StockSheet";

type BoardState = {
  status: "idle" | "running" | "done" | "error";
  hits: ExpansionHit[];
  scanned: number;
  updatedAt: string | null;
  error: string | null;
};

const idleBoard = (): BoardState => ({
  status: "idle",
  hits: [],
  scanned: 0,
  updatedAt: null,
  error: null,
});

function ConditionsCard({
  title,
  tone,
  lines,
}: {
  title: string;
  tone: "bull" | "bear";
  lines: string[];
}) {
  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <h2
        className={`text-sm font-semibold ${
          tone === "bull" ? "text-emerald-600" : "text-red-600"
        }`}
      >
        {title}
      </h2>
      <ol className="mt-2 list-decimal space-y-1 pl-4 text-[11px] leading-snug text-[var(--muted)]">
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ol>
    </section>
  );
}

function HitsBoard({
  title,
  side,
  board,
  onRun,
  selected,
  onSelect,
}: {
  title: string;
  side: "bullish" | "bearish";
  board: BoardState;
  onRun: () => void;
  selected: string | null;
  onSelect: (symbol: string) => void;
}) {
  const accent = side === "bullish" ? "text-emerald-600" : "text-red-600";
  const running = board.status === "running";
  const btnClass =
    side === "bullish"
      ? running
        ? "bg-emerald-600/80 text-white border-emerald-600"
        : "bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-500"
      : running
        ? "bg-red-600/80 text-white border-red-600"
        : "bg-red-600 text-white border-red-600 hover:bg-red-500";

  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)]">
      <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] px-4 py-3">
        <button
          type="button"
          onClick={onRun}
          disabled={running}
          className={`rounded-md border px-3 py-1.5 text-sm font-semibold transition disabled:cursor-wait ${btnClass}`}
        >
          {running ? "Running…" : title}
        </button>
        <span className={`text-xs tabular-nums ${accent}`}>
          {running
            ? "scanning 213…"
            : `${board.hits.length} match${board.hits.length === 1 ? "" : "es"}`}
        </span>
      </div>
      <ul className="max-h-[28rem] divide-y divide-[var(--border)] overflow-auto">
        {running && (
          <li className="px-4 py-10 text-center text-sm text-[var(--muted)]">
            <span className="inline-flex items-center gap-2">
              <span
                className={`h-2 w-2 animate-pulse rounded-full ${
                  side === "bullish" ? "bg-emerald-500" : "bg-red-500"
                }`}
              />
              Running {title.toLowerCase()} conditions on all F&amp;O stocks…
            </span>
            <div className="mt-2 text-[11px] text-[var(--muted)]">
              Usually 1–2 minutes on first run; later runs reuse today&apos;s
              daily cache.
            </div>
          </li>
        )}
        {!running && board.status === "idle" && (
          <li className="px-4 py-10 text-center text-sm text-[var(--muted)]">
            0 matches — click <span className={accent}>{title}</span> to run
            conditions
          </li>
        )}
        {!running && board.status === "error" && (
          <li className="px-4 py-8 text-center text-sm text-[var(--bear)]">
            {board.error ?? "Scan failed. Try again."}
          </li>
        )}
        {!running && board.status === "done" && board.hits.length === 0 && (
          <li className="px-4 py-8 text-center text-sm text-[var(--muted)]">
            0 matches — no F&amp;O names passed every {side} condition
            {board.scanned > 0 ? ` (scanned ${board.scanned})` : ""}
          </li>
        )}
        {!running &&
          board.hits.map((row, i) => {
            const isSel = selected === row.symbol;
            return (
              <li key={row.symbol}>
                <button
                  type="button"
                  onClick={() => onSelect(row.symbol)}
                  className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-[var(--surface-2)] ${
                    isSel ? "bg-[var(--surface-2)]" : ""
                  }`}
                >
                  <span className="w-6 text-xs tabular-nums text-[var(--muted)]">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{row.symbol}</div>
                    <div className="truncate text-xs text-[var(--muted)]">
                      {row.sector} · {row.name}
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
      {board.updatedAt && board.status === "done" && (
        <div className="border-t border-[var(--border)] px-4 py-2 text-[10px] text-[var(--muted)]">
          Last run{" "}
          {new Date(board.updatedAt).toLocaleTimeString("en-IN", {
            timeZone: "Asia/Kolkata",
            hour: "2-digit",
            minute: "2-digit",
          })}{" "}
          IST · scanned {board.scanned}
        </div>
      )}
    </section>
  );
}

export function SmartMoneyClient() {
  const [bullish, setBullish] = useState<BoardState>(idleBoard);
  const [bearish, setBearish] = useState<BoardState>(idleBoard);
  const [selected, setSelected] = useState<string | null>(null);

  const runSide = useCallback(async (side: "bullish" | "bearish") => {
    const setBoard = side === "bullish" ? setBullish : setBearish;
    setBoard((prev) => ({
      ...prev,
      status: "running",
      error: null,
    }));
    try {
      const res = await fetch(`/api/smart-money?side=${side}&force=1`);
      if (!res.ok) throw new Error("fail");
      const json = (await res.json()) as ExpansionSideResponse;
      setBoard({
        status: "done",
        hits: json.hits,
        scanned: json.scanned,
        updatedAt: json.updatedAt,
        error: null,
      });
    } catch {
      setBoard((prev) => ({
        ...prev,
        status: "error",
        error: `Could not run ${side} scan.`,
      }));
    }
  }, []);

  const symbols = useMemo(
    () => [...bullish.hits, ...bearish.hits].map((r) => r.symbol),
    [bullish.hits, bearish.hits],
  );

  return (
    <div className="mx-auto max-w-7xl space-y-4 px-4 py-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Smart Money</h1>
        <p className="text-sm text-[var(--muted)]">
          Click Bullish or Bearish to scan all F&amp;O names — page load does
          not run any conditions
        </p>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <ConditionsCard
          title="Bullish conditions"
          tone="bull"
          lines={BULLISH_CONDITIONS}
        />
        <ConditionsCard
          title="Bearish conditions"
          tone="bear"
          lines={BEARISH_CONDITIONS}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <HitsBoard
          title="Bullish"
          side="bullish"
          board={bullish}
          onRun={() => runSide("bullish")}
          selected={selected}
          onSelect={setSelected}
        />
        <HitsBoard
          title="Bearish"
          side="bearish"
          board={bearish}
          onRun={() => runSide("bearish")}
          selected={selected}
          onSelect={setSelected}
        />
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
