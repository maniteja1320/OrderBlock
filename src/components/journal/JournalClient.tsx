"use client";

import { useEffect, useMemo, useState } from "react";

export interface Trade {
  id: string;
  symbol: string;
  side: "BUY" | "SELL";
  qty: number;
  entry: number;
  exit: number;
  from: string;
  to: string;
  setup: string;
  note: string;
}

const KEY = "ob-journal-trades";

function loadTrades(): Trade[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]") as Trade[];
  } catch {
    return [];
  }
}

function pnl(t: Trade) {
  const dir = t.side === "BUY" ? 1 : -1;
  return (t.exit - t.entry) * t.qty * dir;
}

export function JournalClient() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [form, setForm] = useState({
    symbol: "",
    side: "BUY" as "BUY" | "SELL",
    qty: "1",
    entry: "",
    exit: "",
    from: new Date().toISOString().slice(0, 10),
    to: new Date().toISOString().slice(0, 10),
    setup: "Order Block",
    note: "",
  });

  useEffect(() => {
    setTrades(loadTrades());
  }, []);

  const persist = (next: Trade[]) => {
    setTrades(next);
    localStorage.setItem(KEY, JSON.stringify(next));
  };

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    const trade: Trade = {
      id: crypto.randomUUID(),
      symbol: form.symbol.toUpperCase().trim(),
      side: form.side,
      qty: Number(form.qty) || 0,
      entry: Number(form.entry) || 0,
      exit: Number(form.exit) || 0,
      from: form.from,
      to: form.to,
      setup: form.setup,
      note: form.note,
    };
    if (!trade.symbol || !trade.qty || !trade.entry) return;
    persist([trade, ...trades]);
    setForm((f) => ({ ...f, symbol: "", entry: "", exit: "", note: "" }));
  };

  const byDay = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of trades) {
      map.set(t.to, (map.get(t.to) || 0) + pnl(t));
    }
    return map;
  }, [trades]);

  const days = useMemo(() => {
    const out: string[] = [];
    const d = new Date();
    for (let i = 34; i >= 0; i--) {
      const x = new Date(d);
      x.setDate(d.getDate() - i);
      out.push(x.toISOString().slice(0, 10));
    }
    return out;
  }, []);

  const maxAbs = Math.max(1, ...[...byDay.values()].map((v) => Math.abs(v)));

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6">
      <div>
        <h1 className="text-xl font-semibold">Trading journal</h1>
        <p className="text-sm text-[var(--muted)]">
          Log trades in seconds. See P&amp;L as a calendar heatmap.
        </p>
      </div>

      <form
        onSubmit={add}
        className="grid gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        <Field label="Symbol">
          <input
            required
            value={form.symbol}
            onChange={(e) => setForm({ ...form, symbol: e.target.value })}
            className="field"
            placeholder="SBIN"
          />
        </Field>
        <Field label="Side">
          <select
            value={form.side}
            onChange={(e) =>
              setForm({ ...form, side: e.target.value as "BUY" | "SELL" })
            }
            className="field"
          >
            <option value="BUY">BUY</option>
            <option value="SELL">SELL</option>
          </select>
        </Field>
        <Field label="Qty">
          <input
            value={form.qty}
            onChange={(e) => setForm({ ...form, qty: e.target.value })}
            className="field"
            type="number"
            min={1}
          />
        </Field>
        <Field label="Setup">
          <select
            value={form.setup}
            onChange={(e) => setForm({ ...form, setup: e.target.value })}
            className="field"
          >
            <option>Order Block</option>
            <option>Liquidity Sweep</option>
            <option>Breakout</option>
            <option>Other</option>
          </select>
        </Field>
        <Field label="Entry">
          <input
            required
            value={form.entry}
            onChange={(e) => setForm({ ...form, entry: e.target.value })}
            className="field"
            type="number"
            step="any"
          />
        </Field>
        <Field label="Exit">
          <input
            value={form.exit}
            onChange={(e) => setForm({ ...form, exit: e.target.value })}
            className="field"
            type="number"
            step="any"
          />
        </Field>
        <Field label="From">
          <input
            type="date"
            value={form.from}
            onChange={(e) => setForm({ ...form, from: e.target.value })}
            className="field"
          />
        </Field>
        <Field label="To">
          <input
            type="date"
            value={form.to}
            onChange={(e) => setForm({ ...form, to: e.target.value })}
            className="field"
          />
        </Field>
        <Field label="Note" className="sm:col-span-2 lg:col-span-4">
          <input
            value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
            className="field"
            placeholder="Optional note"
          />
        </Field>
        <div className="sm:col-span-2 lg:col-span-4">
          <button
            type="submit"
            className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white"
          >
            Add trade
          </button>
        </div>
      </form>

      <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <h2 className="mb-3 text-sm font-semibold">P&amp;L calendar</h2>
        <div className="grid grid-cols-7 gap-1.5">
          {days.map((day) => {
            const v = byDay.get(day) || 0;
            const intensity = Math.min(1, Math.abs(v) / maxAbs);
            const bg =
              v > 0
                ? `rgba(22,163,74,${0.15 + intensity * 0.7})`
                : v < 0
                  ? `rgba(220,38,38,${0.15 + intensity * 0.7})`
                  : "var(--surface-2)";
            return (
              <div
                key={day}
                title={`${day}: ${v.toFixed(0)}`}
                className="aspect-square rounded-md border border-[var(--border)] p-1 text-[10px]"
                style={{ background: bg }}
              >
                {day.slice(8)}
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)]">
        <div className="border-b border-[var(--border)] px-4 py-3 text-sm font-semibold">
          Trades ({trades.length})
        </div>
        <ul className="divide-y divide-[var(--border)]">
          {trades.length === 0 && (
            <li className="px-4 py-8 text-center text-sm text-[var(--muted)]">
              No trades yet
            </li>
          )}
          {trades.map((t) => {
            const p = pnl(t);
            return (
              <li
                key={t.id}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm"
              >
                <div>
                  <div className="font-medium">
                    {t.symbol} · {t.side} · {t.qty}
                  </div>
                  <div className="text-xs text-[var(--muted)]">
                    {t.from} → {t.to} · {t.setup}
                    {t.note ? ` · ${t.note}` : ""}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={
                      p >= 0 ? "font-medium text-emerald-600" : "font-medium text-red-600"
                    }
                  >
                    {p >= 0 ? "+" : ""}
                    {p.toFixed(0)}
                  </span>
                  <button
                    type="button"
                    className="text-xs text-[var(--muted)] hover:text-red-600"
                    onClick={() => persist(trades.filter((x) => x.id !== t.id))}
                  >
                    Delete
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

    </div>
  );
}

function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`block text-xs text-[var(--muted)] ${className}`}>
      <span className="mb-1 block">{label}</span>
      {children}
    </label>
  );
}
