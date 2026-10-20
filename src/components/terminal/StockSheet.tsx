"use client";

import { useEffect, useState } from "react";
import type { StockDetail } from "@/lib/types";
import { StockChart } from "./StockChart";
import { VolumeProfilePanel } from "./VolumeProfilePanel";

export interface BoardMeta {
  rank: number;
  boardSize: number;
  percentile: number;
  isPick: boolean;
  boardSide: "bullish" | "bearish";
}

interface Props {
  symbol: string | null;
  symbols: string[];
  boardMeta?: BoardMeta | null;
  onClose: () => void;
  onNavigate: (symbol: string) => void;
}

export function StockSheet({
  symbol,
  symbols,
  boardMeta = null,
  onClose,
  onNavigate,
}: Props) {
  const [detail, setDetail] = useState<StockDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!symbol) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setDetail(null);
    const ctrl = new AbortController();
    const kill = setTimeout(() => ctrl.abort(), 20_000);

    fetch(`/api/stock/${encodeURIComponent(symbol)}`, { signal: ctrl.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error("Failed to load");
        return r.json();
      })
      .then((data: StockDetail) => {
        if (!cancelled) setDetail(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          const aborted =
            err instanceof DOMException && err.name === "AbortError";
          setError(
            aborted
              ? "Timed out loading stock data. Try again."
              : "Could not load chart data",
          );
        }
      })
      .finally(() => {
        clearTimeout(kill);
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [symbol]);

  if (!symbol) return null;

  const idx = symbols.indexOf(symbol);
  const prev = idx > 0 ? symbols[idx - 1] : null;
  const next = idx >= 0 && idx < symbols.length - 1 ? symbols[idx + 1] : null;
  const zone =
    detail?.zones.find((z) => z.confirmed && z.isCurrent) ??
    detail?.zones.filter((z) => z.confirmed).at(-1) ??
    detail?.zones.find((z) => z.isCurrent) ??
    detail?.zones.at(-1);
  const forming = detail?.zones.find((z) => !z.confirmed);
  const q = detail?.quote;
  const apiStats = detail?.stats;

  const side: "bullish" | "bearish" =
    boardMeta?.boardSide ??
    apiStats?.boardSide ??
    (q?.side === "bearish" ? "bearish" : "bullish");

  const s = apiStats
    ? {
        ...apiStats,
        rank: boardMeta?.rank ?? apiStats.rank,
        boardSize: boardMeta?.boardSize ?? apiStats.boardSize,
        percentile: boardMeta?.percentile ?? apiStats.percentile,
        isPick: boardMeta?.isPick ?? apiStats.isPick,
        boardSide: side,
        rule: boardMeta
          ? boardMeta.isPick
            ? `PICK · ${boardMeta.boardSide.toUpperCase()} #${boardMeta.rank}`
            : boardMeta.rank <= 3
              ? "NOT PICKED · sector cap"
              : "NOT PICKED · outside top 3"
          : apiStats.rule,
      }
    : null;

  const inv =
    detail?.levels.find((l) => l.kind === "invalidation" && l.isCurrent) ??
    detail?.levels.filter((l) => l.kind === "invalidation").at(-1);
  const ahead1 =
    detail?.levels.find((l) =>
      side === "bullish"
        ? l.label === "R1" && l.kind === "resistance" && l.isCurrent
        : l.label === "S1" && l.kind === "support" && l.isCurrent,
    ) ??
    detail?.levels.find((l) =>
      side === "bullish"
        ? l.label === "R1" && l.kind === "resistance"
        : l.label === "S1" && l.kind === "support",
    );
  const ahead2 =
    detail?.levels.find((l) =>
      side === "bullish"
        ? l.label === "R2" && l.isCurrent
        : l.label === "S2" && l.isCurrent,
    ) ??
    detail?.levels.find((l) =>
      side === "bullish" ? l.label === "R2" : l.label === "S2",
    );

  const zMid = zone ? (zone.top + zone.bottom) / 2 : null;
  const zInvLabel = side === "bullish" ? "Z / S1" : "Z / R1";
  const zInvValue =
    zMid != null && inv
      ? `${zMid.toFixed(2)} / ${inv.price.toFixed(2)}`
      : zone
        ? `${zone.bottom.toFixed(2)}–${zone.top.toFixed(2)}`
        : "—";

  const aheadLabel = side === "bullish" ? "R1 / R2" : "S1 / S2";
  const aheadValue =
    ahead1 && ahead2
      ? `${ahead1.price.toFixed(2)} / ${ahead2.price.toFixed(2)}`
      : ahead1
        ? ahead1.price.toFixed(2)
        : "—";

  const obValue = zone
    ? `${zone.bottom.toFixed(2)}–${zone.top.toFixed(2)}`
    : "—";

  const deltaPts =
    q && q.previousClose
      ? q.last - q.previousClose
      : null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 p-0 sm:items-center sm:p-4">
      <div className="flex max-h-[94vh] w-full max-w-4xl flex-col overflow-hidden rounded-t-2xl border border-[var(--border)] bg-[var(--bg)] shadow-2xl sm:rounded-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-lg font-semibold tracking-tight">
                {symbol}
                {q ? (
                  <span className="ml-1 text-sm font-normal text-[var(--muted)]">
                    · {q.sector}
                  </span>
                ) : null}
              </h3>
              <Badge tone={side === "bullish" ? "bull" : "bear"}>
                {side.toUpperCase()}
              </Badge>
              {s?.buildUp && s.buildUp !== "NEUTRAL" && (
                <Badge
                  tone={
                    s.buildUp.includes("LONG") || s.buildUp.includes("COVERING")
                      ? "bull"
                      : "bear"
                  }
                >
                  {s.buildUp}
                </Badge>
              )}
            </div>
            {q && (
              <p className="mt-1 text-sm">
                <span className="text-xl font-semibold tabular-nums">
                  {q.last.toFixed(2)}
                </span>{" "}
                <span
                  className={
                    q.changePct >= 0 ? "text-emerald-500" : "text-red-500"
                  }
                >
                  {q.changePct >= 0 ? "+" : ""}
                  {q.changePct.toFixed(2)}%
                </span>
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-md border border-[var(--border)] px-3 py-1.5 text-sm"
          >
            Close
          </button>
        </div>

        <div className="flex-1 overflow-auto">
          {loading && (
            <p className="px-4 py-16 text-center text-sm text-[var(--muted)]">
              Loading VWAP, OI, zones…
            </p>
          )}
          {error && (
            <p className="px-4 py-16 text-center text-sm text-red-600">{error}</p>
          )}

          {detail && !loading && q && (
            <>
              <div className="grid grid-cols-2 gap-2 border-b border-[var(--border)] px-4 py-3 text-xs sm:grid-cols-3">
                <Metric
                  label="Rank"
                  value={
                    s?.rank != null && s.boardSize != null
                      ? `#${s.rank}/${s.boardSize}`
                      : "—"
                  }
                  sub={
                    s?.percentile != null
                      ? `p${s.percentile}`
                      : "Open board first"
                  }
                />
                <Metric
                  label="OI"
                  value={
                    s?.oiChangePct != null
                      ? `${s.oiChangePct >= 0 ? "+" : ""}${s.oiChangePct.toFixed(1)}%`
                      : "N/A"
                  }
                  sub={s?.oi != null ? formatOi(s.oi) : "NSE unavailable"}
                  tone={
                    s?.oiChangePct == null
                      ? "muted"
                      : s.oiChangePct >= 0
                        ? "bull"
                        : "bear"
                  }
                />
                <Metric
                  label="VWAP"
                  value={s?.vwap != null ? s.vwap.toFixed(2) : "—"}
                  sub={
                    s?.pctAboveVwap != null
                      ? `${s.pctAboveVwap >= 0 ? "+" : ""}${s.pctAboveVwap.toFixed(2)}%`
                      : undefined
                  }
                  tone={
                    s?.pctAboveVwap == null
                      ? "muted"
                      : s.pctAboveVwap >= 0
                        ? "bull"
                        : "bear"
                  }
                />
                <Metric
                  label={zInvLabel}
                  value={zInvValue}
                  sub={side === "bullish" ? "zone / invalidation" : "zone / invalidation"}
                />
                <Metric
                  label="R:R"
                  value={s?.riskReward ?? "—"}
                  sub={
                    s?.riskRewardRatio != null
                      ? s.riskRewardRatio >= 1.5
                        ? "meets floor"
                        : "below 1:1.5"
                      : undefined
                  }
                  tone={
                    s?.riskRewardRatio == null
                      ? "muted"
                      : s.riskRewardRatio >= 1.5
                        ? "bull"
                        : "bear"
                  }
                />
                <Metric
                  label="CONV"
                  value={
                    s?.conviction != null ? s.conviction.toFixed(1) : "—"
                  }
                  sub="conviction"
                />
                <Metric
                  label="Δ"
                  value={
                    deltaPts != null
                      ? `${deltaPts >= 0 ? "+" : ""}${deltaPts.toFixed(2)}`
                      : "—"
                  }
                  sub={
                    q
                      ? `${q.changePct >= 0 ? "+" : ""}${q.changePct.toFixed(2)}%`
                      : undefined
                  }
                  tone={
                    deltaPts == null
                      ? "muted"
                      : deltaPts >= 0
                        ? "bull"
                        : "bear"
                  }
                />
                <Metric
                  label="OB"
                  value={obValue}
                  sub={
                    zone
                      ? zone.confirmed
                        ? "confirmed"
                        : "forming"
                      : undefined
                  }
                />
                <Metric
                  label={aheadLabel}
                  value={aheadValue}
                  sub={
                    side === "bullish"
                      ? "Resistance 1 / 2"
                      : "Support 1 / 2"
                  }
                />
                <Metric
                  label="Rule"
                  value={s?.isPick ? "PICK" : s?.rule?.startsWith("NOT") ? "SKIP" : "—"}
                  sub={s?.rule}
                  tone={s?.isPick ? "bull" : "muted"}
                />
              </div>

              {forming && (
                <div className="border-b border-[var(--border)] px-4 py-2 text-xs text-[var(--muted)]">
                  Forming OB (dotted):{" "}
                  <span className="font-medium text-[var(--fg)]">
                    {forming.bottom.toFixed(2)}–{forming.top.toFixed(2)}
                  </span>
                </div>
              )}

              {detail.smartMoney && (
                <div className="grid grid-cols-2 gap-2 border-b border-[var(--border)] px-4 py-3 sm:grid-cols-4">
                  <Metric
                    label="Tape score"
                    value={String(detail.smartMoney.score)}
                    sub={detail.smartMoney.bias}
                    tone={
                      detail.smartMoney.bias === "bullish"
                        ? "bull"
                        : detail.smartMoney.bias === "bearish"
                          ? "bear"
                          : "muted"
                    }
                  />
                  <Metric
                    label="CVD"
                    value={`${detail.smartMoney.cvd >= 0 ? "+" : ""}${Math.round(detail.smartMoney.cvd).toLocaleString("en-IN")}`}
                    sub={
                      detail.smartMoney.divergence !== "none"
                        ? `${detail.smartMoney.divergence} div`
                        : "proxy delta sum"
                    }
                    tone={detail.smartMoney.cvd >= 0 ? "bull" : "bear"}
                  />
                  <Metric
                    label="RVOL"
                    value={`${detail.smartMoney.relativeVolume.toFixed(2)}×`}
                    sub={`${detail.smartMoney.bigPrintCount} big · ${detail.smartMoney.absorptionCount} absorb`}
                  />
                  <Metric
                    label="POC"
                    value={
                      detail.smartMoney.profile
                        ? detail.smartMoney.profile.poc.toFixed(2)
                        : "—"
                    }
                    sub="volume profile"
                  />
                </div>
              )}

              <div className="grid gap-3 p-3 sm:grid-cols-[1fr_140px] sm:p-4">
                <StockChart
                  candles={detail.candles}
                  zones={detail.zones}
                  levels={detail.levels}
                  vwap={s?.vwap ?? null}
                  smartMoney={detail.smartMoney}
                  height={420}
                />
                <VolumeProfilePanel smartMoney={detail.smartMoney} />
              </div>
              {detail.smartMoney?.note && (
                <p className="border-t border-[var(--border)] px-4 py-2 text-[11px] text-[var(--muted)]">
                  {detail.smartMoney.note}
                  <span className="ml-1 opacity-70">
                    · OHLC proxy (not tick footprint)
                  </span>
                </p>
              )}
            </>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-[var(--border)] px-4 py-3">
          <button
            type="button"
            disabled={!prev}
            onClick={() => prev && onNavigate(prev)}
            className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm disabled:opacity-40"
          >
            ← Prev
          </button>
          <span className="text-xs text-[var(--muted)]">
            {idx + 1} / {symbols.length}
          </span>
          <button
            type="button"
            disabled={!next}
            onClick={() => next && onNavigate(next)}
            className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm disabled:opacity-40"
          >
            Next →
          </button>
        </div>
      </div>
    </div>
  );
}

function formatOi(n: number) {
  if (n >= 1e7) return `${(n / 1e7).toFixed(2)} Cr`;
  if (n >= 1e5) return `${(n / 1e5).toFixed(2)} L`;
  return n.toLocaleString("en-IN");
}

function Badge({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: "bull" | "bear";
}) {
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
        tone === "bull"
          ? "bg-emerald-500/15 text-emerald-500"
          : "bg-red-500/15 text-red-500"
      }`}
    >
      {children}
    </span>
  );
}

function Metric({
  label,
  value,
  sub,
  tone = "muted",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "bull" | "bear" | "muted";
}) {
  const color =
    tone === "bull"
      ? "text-emerald-500"
      : tone === "bear"
        ? "text-red-500"
        : "text-[var(--fg)]";
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-2">
      <div className="text-[10px] uppercase tracking-wide text-[var(--muted)]">
        {label}
      </div>
      <div className={`mt-0.5 text-sm font-semibold tabular-nums ${color}`}>
        {value}
      </div>
      {sub && (
        <div className="mt-0.5 truncate text-[10px] text-[var(--muted)]">{sub}</div>
      )}
    </div>
  );
}
