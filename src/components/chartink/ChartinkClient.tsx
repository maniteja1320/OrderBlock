"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { isWeekdayMarketHours } from "@/lib/marketHours";
import type { BullVsBearResponse } from "@/lib/bullVsBearTypes";
import type { ChartinkBoardResponse } from "@/lib/chartinkBoardTypes";
import type { FoGainersResponse } from "@/lib/foGainersTypes";
import type { NarrowCprResponse } from "@/lib/narrowCprTypes";
import type { Near52WeekHighResponse } from "@/lib/near52WeekHighTypes";
import type { OiOptionsStocksResponse } from "@/lib/oiOptionsStocksTypes";
import type { VolumeIncreaseResponse } from "@/lib/volumeIncreaseTypes";

export function ChartinkClient() {
  const [bullBear, setBullBear] = useState<BullVsBearResponse | null>(null);
  const [volume, setVolume] = useState<VolumeIncreaseResponse | null>(null);
  const [oiStocks, setOiStocks] = useState<OiOptionsStocksResponse | null>(
    null,
  );
  const [gainers, setGainers] = useState<FoGainersResponse | null>(null);
  const [losers, setLosers] = useState<FoGainersResponse | null>(null);
  const [narrowCpr, setNarrowCpr] = useState<NarrowCprResponse | null>(null);
  const [near52, setNear52] = useState<Near52WeekHighResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [boardError, setBoardError] = useState<string | null>(null);

  const loadBoard = useCallback(async (force = false) => {
    try {
      setBoardError(null);
      const res = await fetch(`/api/chartink/board${force ? "?force=1" : ""}`);
      const json = (await res.json()) as ChartinkBoardResponse;
      if (!res.ok && !json.bullVsBear) {
        throw new Error(json.error || "Failed to load Chartink board");
      }
      setBullBear(json.bullVsBear);
      setVolume(json.volumeIncrease);
      setOiStocks(json.oiOptionsStocks);
      setGainers(json.foGainers);
      setLosers(json.foLosers);
      setNarrowCpr(json.narrowCpr);
      setNear52(json.near52WeekHigh);
      if (json.error) setBoardError(json.error);
    } catch (e) {
      setBoardError(
        e instanceof Error ? e.message : "Could not refresh Chartink board.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadBoard();
  }, [loadBoard]);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (isWeekdayMarketHours()) void loadBoard();
    }, 60_000);
    return () => window.clearInterval(id);
  }, [loadBoard]);

  return (
    <div className="mx-auto max-w-7xl space-y-4 px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Chartink</h1>
          <p className="text-sm text-[var(--muted)]">
            F&amp;O cash dashboards · Upstox · single board feed
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setLoading(true);
            void loadBoard(true);
          }}
          className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--muted)] hover:text-[var(--fg)]"
        >
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      {boardError && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
          {boardError}
        </div>
      )}

      <BullVsBearPanel data={bullBear} loading={loading} error={null} />

      <div className="grid min-h-0 items-start gap-4 lg:grid-cols-2">
        <div className="flex min-h-0 flex-col gap-4">
          <VolumeIncreasePanel
            data={volume}
            loading={loading}
            error={null}
          />
          <FoMoversPanel
            title="F&O gainers"
            side="gainers"
            data={gainers}
            loading={loading}
            error={null}
          />
          <NarrowCprPanel
            data={narrowCpr}
            loading={loading}
            error={null}
          />
        </div>
        <div className="flex min-h-0 flex-col gap-4">
          <OiOptionsStocksPanel
            data={oiStocks}
            loading={loading}
            error={null}
          />
          <FoMoversPanel
            title="F&O losers"
            side="losers"
            data={losers}
            loading={loading}
            error={null}
          />
          <Near52WeekHighPanel
            data={near52}
            loading={loading}
            error={null}
          />
        </div>
      </div>
    </div>
  );
}

function BullVsBearPanel({
  data,
  loading,
  error,
}: {
  data: BullVsBearResponse | null;
  loading: boolean;
  error: string | null;
}) {
  const bull = data?.bull ?? 0;
  const bear = data?.bear ?? 0;
  const flat = data?.flat ?? 0;
  const total = bull + bear;
  const bullPct = data?.bullPct ?? 50;
  const bearPct = total ? 100 - bullPct : 50;
  const net = data?.net ?? 0;
  const lean =
    net > 0 ? "Bullish" : net < 0 ? "Bearish" : total ? "Balanced" : "—";

  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
      <div className="mb-4">
        <h2 className="text-base font-semibold tracking-tight">Bull vs Bear</h2>
        <p className="mt-0.5 text-xs text-[var(--muted)]">
          Latest price vs prev day close
          {data?.updatedAt && (
            <>
              {" · "}
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
          <p className="mt-1 text-[11px] text-[var(--muted)]">
            {data.scanned}/{data.universe}
            {data.marketStatus?.label ? ` · ${data.marketStatus.label}` : ""}
            {loading ? " · updating…" : ""}
          </p>
        )}
      </div>

      {error && (
        <div className="mb-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
          {error}
        </div>
      )}

      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-[var(--muted)]">
            Market lean
          </p>
          <p
            className={`mt-1 text-2xl font-semibold tabular-nums ${
              net > 0
                ? "text-emerald-600"
                : net < 0
                  ? "text-red-600"
                  : "text-[var(--fg)]"
            }`}
          >
            {lean}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10px] text-[var(--muted)]">Net</p>
          <p
            className={`mt-1 text-xl font-semibold tabular-nums ${
              net > 0
                ? "text-emerald-600"
                : net < 0
                  ? "text-red-600"
                  : "text-[var(--fg)]"
            }`}
          >
            {net > 0 ? "+" : ""}
            {net}
          </p>
        </div>
      </div>

      <div className="mt-5">
        <div className="mb-1.5 flex justify-between text-[11px] tabular-nums text-[var(--muted)]">
          <span>Bull {bullPct.toFixed(1)}%</span>
          <span>Bear {bearPct.toFixed(1)}%</span>
        </div>
        <div className="flex h-3 overflow-hidden rounded-full bg-[var(--surface-2)]">
          <div
            className="bg-emerald-500 transition-all duration-500"
            style={{ width: `${bullPct}%` }}
          />
          <div
            className="bg-red-500 transition-all duration-500"
            style={{ width: `${bearPct}%` }}
          />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <MiniStat label="Bull" value={bull} tone="bull" />
        <MiniStat label="Bear" value={bear} tone="bear" />
        <MiniStat label="Flat" value={flat} tone="flat" />
      </div>
    </section>
  );
}

function MiniStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "bull" | "bear" | "flat";
}) {
  const color =
    tone === "bull"
      ? "text-emerald-600"
      : tone === "bear"
        ? "text-red-600"
        : "text-[var(--fg)]";
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)]/60 px-2.5 py-2">
      <p className="text-[10px] text-[var(--muted)]">{label}</p>
      <p className={`text-lg font-semibold tabular-nums ${color}`}>{value}</p>
    </div>
  );
}

/** Exactly 10 rows in each stock list (no scroll). */
const VOL_ROW_H = 28;
const VOL_ROW_GAP = 4;
const VOL_LIST_PAD = 10;
const VOL_HEADER_H = 28;
const VOL_VISIBLE = 10;
const VOL_LIST_HEIGHT =
  VOL_LIST_PAD * 2 +
  VOL_VISIBLE * VOL_ROW_H +
  (VOL_VISIBLE - 1) * VOL_ROW_GAP;
const VOL_BOX_HEIGHT = VOL_HEADER_H + VOL_LIST_HEIGHT;

function VolumeIncreasePanel({
  data,
  loading,
  error,
}: {
  data: VolumeIncreaseResponse | null;
  loading: boolean;
  error: string | null;
}) {
  const topRows = useMemo(
    () => (data?.rows ?? []).slice(0, VOL_VISIBLE),
    [data],
  );
  const maxAbs = useMemo(() => {
    let m = 1;
    for (const r of topRows) {
      const a = Math.abs(r.increasePct);
      if (a > m) m = a;
    }
    return m;
  }, [topRows]);

  return (
    <section className="flex h-full min-h-0 flex-col rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
      <div className="mb-3 min-h-[4.25rem]">
        <h2 className="text-base font-semibold tracking-tight">
          Daily volume increase in %
        </h2>
        <p className="mt-0.5 text-xs text-[var(--muted)]">
          (Vol − SMA20) / SMA20 × 100 · F&amp;O only
          {data?.updatedAt && (
            <>
              {" · "}
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
          <p className="mt-1 text-[11px] text-[var(--muted)]">
            Top {topRows.length}
            {data.marketStatus?.label ? ` · ${data.marketStatus.label}` : ""}
            {loading ? " · updating…" : ""}
          </p>
        )}
      </div>

      {error && (
        <div className="mb-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
          {error}
        </div>
      )}

      {topRows.length === 0 && !loading ? (
        <p className="py-12 text-center text-sm text-[var(--muted)]">
          No volume rows yet
        </p>
      ) : loading && topRows.length === 0 ? (
        <p className="py-12 text-center text-sm text-[var(--muted)]">
          Loading Upstox daily volumes…
        </p>
      ) : (
        <div
          className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface-2)]/40 text-sm"
          style={{ height: VOL_BOX_HEIGHT }}
        >
          <div
            className="flex items-center gap-2 border-b border-[var(--border)] px-3 text-[10px] font-medium uppercase tracking-wide text-[var(--muted)]"
            style={{ height: VOL_HEADER_H }}
          >
            <span className="w-[5.5rem] shrink-0">Stock</span>
            <span className="w-12 shrink-0">Volume</span>
            <span className="min-w-0 flex-1">Increase</span>
            <span className="w-14 shrink-0 text-right">%</span>
          </div>
          <ul
            className="px-3"
            style={{
              height: VOL_LIST_HEIGHT,
              paddingTop: VOL_LIST_PAD,
              paddingBottom: VOL_LIST_PAD,
              overflow: "hidden",
            }}
          >
            {topRows.map((row, i) => {
              const pct = row.increasePct;
              const width = Math.min(100, (Math.abs(pct) / maxAbs) * 100);
              const positive = pct >= 0;
              return (
                <li
                  key={row.symbol}
                  className="flex items-center gap-2 text-xs"
                  style={{
                    height: VOL_ROW_H,
                    marginBottom: i === topRows.length - 1 ? 0 : VOL_ROW_GAP,
                  }}
                  title={`${row.name} · vol ${formatVol(row.volume)} · SMA20 ${formatVol(row.sma20)}`}
                >
                  <span className="w-[5.5rem] shrink-0 truncate font-medium">
                    {row.symbol}
                  </span>
                  <span className="w-12 shrink-0 tabular-nums text-[var(--muted)]">
                    {formatVol(row.volume)}
                  </span>
                  <div className="relative h-4 min-w-0 flex-1 overflow-hidden rounded bg-[var(--surface)]">
                    <div
                      className={`absolute inset-y-0 left-0 rounded transition-all ${
                        positive ? "bg-emerald-500/80" : "bg-red-500/80"
                      }`}
                      style={{ width: `${width}%` }}
                    />
                  </div>
                  <span
                    className={`w-14 shrink-0 text-right tabular-nums font-medium ${
                      positive ? "text-emerald-600" : "text-red-600"
                    }`}
                  >
                    {positive ? "+" : ""}
                    {pct.toFixed(1)}%
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}

function OiOptionsStocksPanel({
  data,
  loading,
  error,
}: {
  data: OiOptionsStocksResponse | null;
  loading: boolean;
  error: string | null;
}) {
  const topRows = useMemo(
    () => (data?.rows ?? []).slice(0, VOL_VISIBLE),
    [data],
  );

  return (
    <section className="flex h-full min-h-0 flex-col rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
      <div className="mb-3 min-h-[4.25rem]">
        <h2 className="text-base font-semibold tracking-tight">
          Open Interest Options Stocks
        </h2>
        <p className="mt-0.5 text-xs text-[var(--muted)]">
          % Change · Price · Volume · F&amp;O underlyings
          {data?.updatedAt && (
            <>
              {" · "}
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
          <p className="mt-1 text-[11px] text-[var(--muted)]">
            Top {topRows.length}
            {data.marketStatus?.label ? ` · ${data.marketStatus.label}` : ""}
            {loading ? " · updating…" : ""}
          </p>
        )}
      </div>

      {error && (
        <div className="mb-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
          {error}
        </div>
      )}

      {topRows.length === 0 && !loading ? (
        <p className="py-12 text-center text-sm text-[var(--muted)]">
          No stocks yet
        </p>
      ) : loading && topRows.length === 0 ? (
        <p className="py-12 text-center text-sm text-[var(--muted)]">
          Loading Upstox quotes…
        </p>
      ) : (
        <div
          className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface-2)]/40 text-sm"
          style={{ height: VOL_BOX_HEIGHT }}
        >
          <div
            className="flex items-center gap-2 border-b border-[var(--border)] px-3 text-[10px] font-medium uppercase tracking-wide text-[var(--muted)]"
            style={{ height: VOL_HEADER_H }}
          >
            <span className="w-[5.5rem] shrink-0">Stock</span>
            <span className="w-16 shrink-0 text-right">Chg</span>
            <span className="w-20 shrink-0 text-right">Price</span>
            <span className="min-w-0 flex-1 text-right">Volume</span>
          </div>
          <ul
            className="px-3"
            style={{
              height: VOL_LIST_HEIGHT,
              paddingTop: VOL_LIST_PAD,
              paddingBottom: VOL_LIST_PAD,
              overflow: "hidden",
            }}
          >
            {topRows.map((row, i) => {
              const up = row.changePct >= 0;
              return (
                <li
                  key={row.symbol}
                  className="flex items-center gap-2 text-xs"
                  style={{
                    height: VOL_ROW_H,
                    marginBottom: i === topRows.length - 1 ? 0 : VOL_ROW_GAP,
                  }}
                  title={`${row.name} · ${row.sector}`}
                >
                  <span className="w-[5.5rem] shrink-0 truncate font-medium">
                    {row.symbol}
                  </span>
                  <span
                    className={`w-16 shrink-0 text-right tabular-nums font-medium ${
                      up ? "text-emerald-600" : "text-red-600"
                    }`}
                  >
                    {up ? "+" : ""}
                    {row.changePct.toFixed(2)}%
                  </span>
                  <span className="w-20 shrink-0 text-right tabular-nums">
                    {row.price.toFixed(2)}
                  </span>
                  <span className="min-w-0 flex-1 text-right tabular-nums text-[var(--muted)]">
                    {formatVol(row.volume)}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}

function Near52WeekHighPanel({
  data,
  loading,
  error,
}: {
  data: Near52WeekHighResponse | null;
  loading: boolean;
  error: string | null;
}) {
  const topRows = useMemo(
    () => (data?.rows ?? []).slice(0, VOL_VISIBLE),
    [data],
  );

  return (
    <section className="flex h-full min-h-0 flex-col rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
      <div className="mb-3 min-h-[4.25rem]">
        <h2 className="text-base font-semibold tracking-tight">
          Near 52 week high
        </h2>
        <p className="mt-0.5 text-xs text-[var(--muted)]">
          (LTP − 52w high) / 52w high · nearest first · Upstox quotes
          {data?.updatedAt && (
            <>
              {" · "}
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
          <p className="mt-1 text-[11px] text-[var(--muted)]">
            Top {topRows.length}
            {data.marketStatus?.label ? ` · ${data.marketStatus.label}` : ""}
            {loading ? " · updating…" : ""}
          </p>
        )}
      </div>

      {error && (
        <div className="mb-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
          {error}
        </div>
      )}

      {topRows.length === 0 && !loading ? (
        <p className="py-12 text-center text-sm text-[var(--muted)]">
          No Near 52w high rows yet
        </p>
      ) : loading && topRows.length === 0 ? (
        <p className="py-12 text-center text-sm text-[var(--muted)]">
          Loading Upstox 52w highs…
        </p>
      ) : (
        <div
          className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface-2)]/40 text-sm"
          style={{ height: VOL_BOX_HEIGHT }}
        >
          <div
            className="flex items-center gap-2 border-b border-[var(--border)] px-3 text-[10px] font-medium uppercase tracking-wide text-[var(--muted)]"
            style={{ height: VOL_HEADER_H }}
          >
            <span className="w-[5rem] shrink-0">Stock</span>
            <span className="w-14 shrink-0 text-right">% High</span>
            <span className="w-16 shrink-0 text-right">LTP</span>
            <span className="min-w-0 flex-1 text-right">Vol</span>
            <span className="w-14 shrink-0 text-right">% Chg</span>
          </div>
          <ul
            className="px-3"
            style={{
              height: VOL_LIST_HEIGHT,
              paddingTop: VOL_LIST_PAD,
              paddingBottom: VOL_LIST_PAD,
              overflow: "hidden",
            }}
          >
            {topRows.map((row, i) => {
              const up = row.changePct >= 0;
              return (
                <li
                  key={row.symbol}
                  className="flex items-center gap-2 text-xs"
                  style={{
                    height: VOL_ROW_H,
                    marginBottom: i === topRows.length - 1 ? 0 : VOL_ROW_GAP,
                  }}
                  title={`${row.name} · 52w/252d high ${row.maxHigh252.toFixed(2)}`}
                >
                  <span className="w-[5rem] shrink-0 truncate font-medium">
                    {row.symbol}
                  </span>
                  <span className="w-14 shrink-0 text-right tabular-nums font-medium text-[var(--accent)]">
                    {row.pctHigh >= 0 ? "+" : ""}
                    {row.pctHigh.toFixed(2)}%
                  </span>
                  <span className="w-16 shrink-0 text-right tabular-nums">
                    {row.ltp.toFixed(2)}
                  </span>
                  <span className="min-w-0 flex-1 text-right tabular-nums text-[var(--muted)]">
                    {formatVol(row.volume)}
                  </span>
                  <span
                    className={`w-14 shrink-0 text-right tabular-nums font-medium ${
                      up ? "text-emerald-600" : "text-red-600"
                    }`}
                  >
                    {up ? "+" : ""}
                    {row.changePct.toFixed(2)}%
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}

function NarrowCprPanel({
  data,
  loading,
  error,
}: {
  data: NarrowCprResponse | null;
  loading: boolean;
  error: string | null;
}) {
  const topRows = useMemo(
    () => (data?.rows ?? []).slice(0, VOL_VISIBLE),
    [data],
  );

  return (
    <section className="flex h-full min-h-0 flex-col rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
      <div className="mb-3 min-h-[4.25rem]">
        <h2 className="text-base font-semibold tracking-tight">
          Intraday Narrow CPR
        </h2>
        <p className="mt-0.5 text-xs text-[var(--muted)]">
          Widest CPR first · % change · price · volume
          {data?.updatedAt && (
            <>
              {" · "}
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
          <p className="mt-1 text-[11px] text-[var(--muted)]">
            Top {topRows.length}
            {data.marketStatus?.label ? ` · ${data.marketStatus.label}` : ""}
            {loading ? " · updating…" : ""}
          </p>
        )}
      </div>

      {error && (
        <div className="mb-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
          {error}
        </div>
      )}

      {topRows.length === 0 && !loading ? (
        <p className="py-12 text-center text-sm text-[var(--muted)]">
          No Narrow CPR rows yet
        </p>
      ) : loading && topRows.length === 0 ? (
        <p className="py-12 text-center text-sm text-[var(--muted)]">
          Loading Upstox Narrow CPR…
        </p>
      ) : (
        <div
          className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface-2)]/40 text-sm"
          style={{ height: VOL_BOX_HEIGHT }}
        >
          <div
            className="flex items-center gap-2 border-b border-[var(--border)] px-3 text-[10px] font-medium uppercase tracking-wide text-[var(--muted)]"
            style={{ height: VOL_HEADER_H }}
          >
            <span className="w-[5.5rem] shrink-0">Stock</span>
            <span className="w-16 shrink-0 text-right">% Chg</span>
            <span className="w-20 shrink-0 text-right">Price</span>
            <span className="min-w-0 flex-1 text-right">Volume</span>
          </div>
          <ul
            className="px-3"
            style={{
              height: VOL_LIST_HEIGHT,
              paddingTop: VOL_LIST_PAD,
              paddingBottom: VOL_LIST_PAD,
              overflow: "hidden",
            }}
          >
            {topRows.map((row, i) => {
              const up = row.changePct >= 0;
              return (
                <li
                  key={row.symbol}
                  className="flex items-center gap-2 text-xs"
                  style={{
                    height: VOL_ROW_H,
                    marginBottom: i === topRows.length - 1 ? 0 : VOL_ROW_GAP,
                  }}
                  title={`${row.name} · CPR width ${row.cprWidthPct.toFixed(3)}%`}
                >
                  <span className="w-[5.5rem] shrink-0 truncate font-medium">
                    {row.symbol}
                  </span>
                  <span
                    className={`w-16 shrink-0 text-right tabular-nums font-medium ${
                      up ? "text-emerald-600" : "text-red-600"
                    }`}
                  >
                    {up ? "+" : ""}
                    {row.changePct.toFixed(2)}%
                  </span>
                  <span className="w-20 shrink-0 text-right tabular-nums">
                    {row.price.toFixed(2)}
                  </span>
                  <span className="min-w-0 flex-1 text-right tabular-nums text-[var(--muted)]">
                    {formatVol(row.volume)}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}

function FoMoversPanel({
  title,
  side,
  data,
  loading,
  error,
}: {
  title: string;
  side: "gainers" | "losers";
  data: FoGainersResponse | null;
  loading: boolean;
  error: string | null;
}) {
  const topRows = useMemo(
    () => (data?.rows ?? []).slice(0, VOL_VISIBLE),
    [data],
  );
  const maxAbs = useMemo(() => {
    let m = 1;
    for (const r of topRows) {
      const a = Math.abs(r.changePct);
      if (a > m) m = a;
    }
    return m;
  }, [topRows]);
  const isGainer = side === "gainers";
  const emptyLabel = isGainer ? "No gainers yet" : "No losers yet";
  const loadingLabel = isGainer
    ? "Loading Upstox gainers…"
    : "Loading Upstox losers…";

  return (
    <section className="flex h-full min-h-0 flex-col rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
      <div className="mb-3 min-h-[4.25rem]">
        <h2 className="text-base font-semibold tracking-tight">{title}</h2>
        <p className="mt-0.5 text-xs text-[var(--muted)]">
          (5m close − prev close) / prev close × 100 · Upstox
          {data?.updatedAt && (
            <>
              {" · "}
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
          <p className="mt-1 text-[11px] text-[var(--muted)]">
            Top {topRows.length}
            {data.marketStatus?.label ? ` · ${data.marketStatus.label}` : ""}
            {loading ? " · updating…" : ""}
          </p>
        )}
      </div>

      {error && (
        <div className="mb-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
          {error}
        </div>
      )}

      {topRows.length === 0 && !loading ? (
        <p className="py-12 text-center text-sm text-[var(--muted)]">
          {emptyLabel}
        </p>
      ) : loading && topRows.length === 0 ? (
        <p className="py-12 text-center text-sm text-[var(--muted)]">
          {loadingLabel}
        </p>
      ) : (
        <div
          className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface-2)]/40 text-sm"
          style={{ height: VOL_BOX_HEIGHT }}
        >
          <div
            className="flex items-center gap-2 border-b border-[var(--border)] px-3 text-[10px] font-medium uppercase tracking-wide text-[var(--muted)]"
            style={{ height: VOL_HEADER_H }}
          >
            <span className="w-[5.5rem] shrink-0">Stock</span>
            <span className="min-w-0 flex-1">Change</span>
            <span className="w-16 shrink-0 text-right">%</span>
          </div>
          <ul
            className="px-3"
            style={{
              height: VOL_LIST_HEIGHT,
              paddingTop: VOL_LIST_PAD,
              paddingBottom: VOL_LIST_PAD,
              overflow: "hidden",
            }}
          >
            {topRows.map((row, i) => {
              const width = Math.min(
                100,
                (Math.abs(row.changePct) / maxAbs) * 100,
              );
              return (
                <li
                  key={row.symbol}
                  className="flex items-center gap-2 text-xs"
                  style={{
                    height: VOL_ROW_H,
                    marginBottom: i === topRows.length - 1 ? 0 : VOL_ROW_GAP,
                  }}
                  title={`${row.name} · ${row.price.toFixed(2)}`}
                >
                  <span className="w-[5.5rem] shrink-0 truncate font-medium">
                    {row.symbol}
                  </span>
                  <div className="relative h-4 min-w-0 flex-1 overflow-hidden rounded bg-[var(--surface)]">
                    <div
                      className={`absolute inset-y-0 left-0 rounded transition-all ${
                        isGainer ? "bg-emerald-500/80" : "bg-red-500/80"
                      }`}
                      style={{ width: `${width}%` }}
                    />
                  </div>
                  <span
                    className={`w-16 shrink-0 text-right tabular-nums font-medium ${
                      isGainer ? "text-emerald-600" : "text-red-600"
                    }`}
                  >
                    {isGainer ? "+" : ""}
                    {row.changePct.toFixed(2)}%
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}

function formatVol(v: number): string {
  if (v >= 1e7) return `${(v / 1e7).toFixed(2)} Cr`;
  if (v >= 1e5) return `${(v / 1e5).toFixed(2)} L`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)} K`;
  return String(Math.round(v));
}
