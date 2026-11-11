import { EventEmitter } from "events";
import { isWeekdayMarketHours } from "../marketHours";
import {
  getMarketDataFeed,
  type BookPressureTick,
} from "../upstox/marketDataFeed";
import { ensureBookSnapshotScheduler } from "../upstox/bookSnapshots";
import { SCANNER_CONFIG } from "./config";
import { evaluateSignal, type ScannerSignal } from "./signals";
import type { PaperSizePlan } from "./paperRisk";

export interface ScannerAlert {
  id: string;
  side: "LONG" | "SHORT";
  symbol: string;
  name: string;
  reason: string;
  ltp: number;
  imbalance: number;
  pendingBuyQty: number;
  pendingSellQty: number;
  volumeTradedToday: number;
  paper: PaperSizePlan;
  at: string;
}

export interface PaperPosition {
  id: string;
  symbol: string;
  side: "LONG" | "SHORT";
  qty: number;
  entry: number;
  stop: number;
  target: number;
  ltp: number;
  unrealizedPnl: number;
  openedAt: string;
  status: "open" | "closed";
  closedAt?: string;
  exit?: number;
  realizedPnl?: number;
  note: string;
}

export interface ScannerRow extends ScannerSignal {
  rank: number;
}

export interface ScannerDashboard {
  updatedAt: string;
  connected: boolean;
  paperTradingOnly: true;
  dataMode: typeof SCANNER_CONFIG.dataMode;
  provider: typeof SCANNER_CONFIG.provider;
  universeSize: number;
  scanned: number;
  longSignals: ScannerRow[];
  shortSignals: ScannerRow[];
  alerts: ScannerAlert[];
  positions: PaperPosition[];
  config: {
    barThreshold: number;
    minPendingBookQty: number;
    paperEquity: number;
    riskPerTrade: number;
    stopPct: number;
  };
  legend: {
    pendingBook: string;
    executedVolume: string;
  };
}

declare global {
  // eslint-disable-next-line no-var
  var __orderblockScanner: ImbalanceScanner | undefined;
}

class ImbalanceScanner extends EventEmitter {
  private signals = new Map<string, ScannerSignal>();
  private alerts: ScannerAlert[] = [];
  private positions: PaperPosition[] = [];
  private lastAlertAt = new Map<string, number>();
  private attached = false;
  private onTick: ((t: BookPressureTick) => void) | null = null;

  attach() {
    if (this.attached) return;
    this.attached = true;
    ensureBookSnapshotScheduler();
    const feed = getMarketDataFeed();
    this.onTick = (tick) => this.handleTick(tick);
    feed.on("tick", this.onTick);
    void feed.ensureStarted().catch(() => undefined);
    // Seed from current books.
    for (const tick of feed.getAllBooks()) this.handleTick(tick);
  }

  snapshot(): ScannerDashboard {
    const feed = getMarketDataFeed();
    // Bid-heavy → long/bullish only; ask-heavy → short/bearish only.
    const longSignals = [...this.signals.values()]
      .filter((s) => s.side === "LONG" && s.bar.imbalance > 0)
      .sort((a, b) => b.bar.imbalance - a.bar.imbalance)
      .slice(0, 20)
      .map((s, i) => ({ ...s, rank: i + 1 }));
    const shortSignals = [...this.signals.values()]
      .filter((s) => s.side === "SHORT" && s.bar.imbalance < 0)
      .sort((a, b) => a.bar.imbalance - b.bar.imbalance)
      .slice(0, 20)
      .map((s, i) => ({ ...s, rank: i + 1 }));

    return {
      updatedAt: new Date().toISOString(),
      connected: feed.status === "connected",
      paperTradingOnly: true,
      dataMode: SCANNER_CONFIG.dataMode,
      provider: SCANNER_CONFIG.provider,
      universeSize: feed.subscribed || 213,
      scanned: this.signals.size,
      longSignals,
      shortSignals,
      alerts: this.alerts.slice(0, SCANNER_CONFIG.maxAlerts),
      positions: this.positions.filter((p) => p.status === "open"),
      config: {
        barThreshold: SCANNER_CONFIG.barThreshold,
        minPendingBookQty: SCANNER_CONFIG.minPendingBookQty,
        paperEquity: SCANNER_CONFIG.paperEquity,
        riskPerTrade: SCANNER_CONFIG.riskPerTrade,
        stopPct: SCANNER_CONFIG.stopPct,
      },
      legend: {
        pendingBook:
          "Pending bid/ask (tbq/tsq + depth) = resting orders still on the book — not trades.",
        executedVolume:
          "volumeTradedToday (vtt) / lastTradeQty (ltq) = executed fills — never used for bar colour.",
      },
    };
  }

  /** Open a paper position from an alert/signal — never hits a broker. */
  openPaper(symbol: string): PaperPosition | null {
    const sig = this.signals.get(symbol.toUpperCase());
    if (!sig || sig.side === "NONE" || !sig.paper) return null;
    const openCount = this.positions.filter((p) => p.status === "open").length;
    if (openCount >= SCANNER_CONFIG.maxOpenPositions) return null;
    if (this.positions.some((p) => p.status === "open" && p.symbol === sig.symbol)) {
      return null;
    }

    const pos: PaperPosition = {
      id: `pp-${sig.symbol}-${Date.now()}`,
      symbol: sig.symbol,
      side: sig.side,
      qty: sig.paper.qty,
      entry: sig.paper.entry,
      stop: sig.paper.stop,
      target: sig.paper.target,
      ltp: sig.ltp,
      unrealizedPnl: 0,
      openedAt: new Date().toISOString(),
      status: "open",
      note: sig.paper.note,
    };
    this.positions.unshift(pos);
    this.emit("dashboard", this.snapshot());
    return pos;
  }

  private handleTick(tick: BookPressureTick) {
    // Mark flat books outside session so residual close books don't spam.
    const live = isWeekdayMarketHours();
    const signal = evaluateSignal(tick);
    if (!live && signal.side !== "NONE") {
      // Keep rows visible after hours but don't raise new alerts.
      this.signals.set(tick.symbol, {
        ...signal,
        reason: `${signal.reason} (outside session — alert suppressed)`,
      });
      this.markToMarket(tick);
      return;
    }

    this.signals.set(tick.symbol, signal);
    this.markToMarket(tick);

    if (signal.side !== "NONE" && signal.paper) {
      this.maybeAlert(signal);
    }
    this.emit("dashboard", this.snapshot());
  }

  private maybeAlert(signal: ScannerSignal) {
    if (signal.side === "NONE" || !signal.paper) return;
    const key = `${signal.symbol}:${signal.side}`;
    const last = this.lastAlertAt.get(key) ?? 0;
    if (Date.now() - last < SCANNER_CONFIG.alertCooldownMs) return;
    this.lastAlertAt.set(key, Date.now());

    const alert: ScannerAlert = {
      id: `al-${signal.symbol}-${Date.now()}`,
      side: signal.side,
      symbol: signal.symbol,
      name: signal.name,
      reason: signal.reason,
      ltp: signal.ltp,
      imbalance: signal.bar.imbalance,
      pendingBuyQty: signal.pendingBuyQty,
      pendingSellQty: signal.pendingSellQty,
      volumeTradedToday: signal.volumeTradedToday,
      paper: signal.paper,
      at: new Date().toISOString(),
    };
    this.alerts.unshift(alert);
    if (this.alerts.length > SCANNER_CONFIG.maxAlerts) {
      this.alerts.length = SCANNER_CONFIG.maxAlerts;
    }
    this.emit("alert", alert);
  }

  private markToMarket(tick: BookPressureTick) {
    for (const pos of this.positions) {
      if (pos.status !== "open" || pos.symbol !== tick.symbol) continue;
      pos.ltp = tick.ltp;
      const dir = pos.side === "LONG" ? 1 : -1;
      pos.unrealizedPnl = +((tick.ltp - pos.entry) * dir * pos.qty).toFixed(2);

      const hitStop =
        pos.side === "LONG" ? tick.ltp <= pos.stop : tick.ltp >= pos.stop;
      const hitTarget =
        pos.side === "LONG" ? tick.ltp >= pos.target : tick.ltp <= pos.target;
      if (hitStop || hitTarget) {
        pos.status = "closed";
        pos.closedAt = new Date().toISOString();
        pos.exit = tick.ltp;
        pos.realizedPnl = pos.unrealizedPnl;
      }
    }
  }
}

export function getImbalanceScanner(): ImbalanceScanner {
  if (!globalThis.__orderblockScanner) {
    globalThis.__orderblockScanner = new ImbalanceScanner();
  }
  return globalThis.__orderblockScanner;
}

export function ensureScannerStarted(): ScannerDashboard {
  const scanner = getImbalanceScanner();
  scanner.attach();
  return scanner.snapshot();
}
