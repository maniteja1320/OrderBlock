import { EventEmitter } from "events";
import path from "path";
import protobuf from "protobufjs";
import WebSocket from "ws";
import { FO_STOCKS, symbolMap } from "../symbols";
import {
  loadFoEquityInstruments,
  type EquityInstrument,
} from "./equityInstruments";

export interface BookPressureTick {
  symbol: string;
  name: string;
  sector: string;
  instrumentKey: string;
  ltp: number;
  close: number;
  changePct: number;
  bidQty: number;
  askQty: number;
  bidPrice: number;
  askPrice: number;
  /**
   * Pending (resting) buy quantity on the book — NOT executed volume.
   * Prefer exchange total buy qty (tbq); else sum of depth bid levels.
   */
  totalBuyQty: number;
  /** Pending (resting) sell quantity on the book — NOT executed volume. */
  totalSellQty: number;
  /** (buy − sell) / (buy + sell); +1 = all bids, −1 = all asks. */
  imbalance: number;
  /** Executed volume traded today (vtt) — fills, not resting orders. */
  volumeTradedToday: number;
  /** Last traded quantity (ltq) — executed, not pending. */
  lastTradeQty: number;
  avgTradedPrice: number;
  updatedAt: number;
}

export interface BookPressureBoard {
  updatedAt: string;
  connected: boolean;
  subscribed: number;
  ticks: number;
  lastMessageAt: string | null;
  error: string | null;
  marketInfo: Record<string, string>;
  bullish: BookPressureRow[];
  bearish: BookPressureRow[];
}

export interface BookPressureRow extends BookPressureTick {
  rank: number;
  side: "bullish" | "bearish";
}

type FeedStatus = "idle" | "connecting" | "connected" | "error";

type DecodedFeed = {
  type?: number | string;
  currentTs?: number | LongLike;
  marketInfo?: { segmentStatus?: Record<string, number | string> };
  feeds?: Record<string, DecodedInstrumentFeed>;
};

type DecodedInstrumentFeed = {
  ltpc?: { ltp?: number; cp?: number; ltq?: number | LongLike };
  fullFeed?: {
    marketFF?: {
      ltpc?: { ltp?: number; cp?: number; ltq?: number | LongLike };
      marketLevel?: {
        bidAskQuote?: Array<{
          bidQ?: number | LongLike;
          askQ?: number | LongLike;
          bidP?: number;
          askP?: number;
        }>;
      };
      tbq?: number;
      tsq?: number;
      vtt?: number | LongLike;
      atp?: number;
    };
  };
  firstLevelWithGreeks?: {
    ltpc?: { ltp?: number; cp?: number; ltq?: number | LongLike };
    firstDepth?: {
      bidQ?: number | LongLike;
      askQ?: number | LongLike;
      bidP?: number;
      askP?: number;
    };
    vtt?: number | LongLike;
  };
};

type LongLike = { toNumber?: () => number } | number | string | bigint;

const AUTHORIZE_URL =
  "https://api.upstox.com/v3/feed/market-data-feed/authorize";
const PROTO_PATH = path.join(
  process.cwd(),
  "src/lib/upstox/MarketDataFeedV3.proto",
);
const RECONNECT_MS = 5_000;
const MAX_RECONNECT_MS = 60_000;

declare global {
  // eslint-disable-next-line no-var
  var __orderblockUpstoxFeed: UpstoxMarketDataFeed | undefined;
}

function num(v: LongLike | undefined | null): number {
  if (v == null) return 0;
  if (typeof v === "number") return v;
  if (typeof v === "bigint") return Number(v);
  if (typeof v === "string") return Number(v) || 0;
  if (typeof v.toNumber === "function") return v.toNumber();
  return Number(v) || 0;
}

function imbalance(buy: number, sell: number): number {
  const t = buy + sell;
  if (t <= 0) return 0;
  return (buy - sell) / t;
}

class UpstoxMarketDataFeed extends EventEmitter {
  status: FeedStatus = "idle";
  error: string | null = null;
  subscribed = 0;
  ticks = 0;
  lastMessageAt: number | null = null;
  marketInfo: Record<string, string> = {};

  constructor() {
    super();
    this.setMaxListeners(40);
  }

  private ws: WebSocket | null = null;
  private FeedResponse: protobuf.Type | null = null;
  private books = new Map<string, BookPressureTick>();
  private keyToSymbol = new Map<string, string>();
  private equities: EquityInstrument[] = [];
  private starting: Promise<void> | null = null;
  private stopRequested = false;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  snapshot(limit = 20): BookPressureBoard {
    const rows = [...this.books.values()].filter(
      (t) => t.totalBuyQty + t.totalSellQty > 0 || t.bidQty + t.askQty > 0,
    );

    const withPressure = rows.map((t) => {
      const buy = t.totalBuyQty > 0 || t.totalSellQty > 0 ? t.totalBuyQty : t.bidQty;
      const sell =
        t.totalBuyQty > 0 || t.totalSellQty > 0 ? t.totalSellQty : t.askQty;
      return { ...t, imbalance: imbalance(buy, sell) };
    });

    // Bid-heavy → bullish only; ask-heavy → bearish only (no cross-listing).
    const heavy = 0.35;
    const bullish = withPressure
      .filter((t) => t.imbalance >= heavy)
      .sort((a, b) => b.imbalance - a.imbalance || b.changePct - a.changePct)
      .slice(0, limit)
      .map((t, i) => ({ ...t, rank: i + 1, side: "bullish" as const }));

    const bearish = withPressure
      .filter((t) => t.imbalance <= -heavy)
      .sort((a, b) => a.imbalance - b.imbalance || a.changePct - b.changePct)
      .slice(0, limit)
      .map((t, i) => ({ ...t, rank: i + 1, side: "bearish" as const }));

    return {
      updatedAt: new Date().toISOString(),
      connected: this.status === "connected",
      subscribed: this.subscribed,
      ticks: this.ticks,
      lastMessageAt: this.lastMessageAt
        ? new Date(this.lastMessageAt).toISOString()
        : null,
      error: this.error,
      marketInfo: this.marketInfo,
      bullish,
      bearish,
    };
  }

  getBook(symbol: string): BookPressureTick | null {
    return this.books.get(symbol.toUpperCase()) ?? null;
  }

  /** Full universe books currently held in memory (may be empty before first feed). */
  getAllBooks(): BookPressureTick[] {
    return [...this.books.values()].map((t) => {
      const buy =
        t.totalBuyQty > 0 || t.totalSellQty > 0 ? t.totalBuyQty : t.bidQty;
      const sell =
        t.totalBuyQty > 0 || t.totalSellQty > 0 ? t.totalSellQty : t.askQty;
      return {
        ...t,
        volumeTradedToday: t.volumeTradedToday ?? 0,
        lastTradeQty: t.lastTradeQty ?? 0,
        avgTradedPrice: t.avgTradedPrice ?? 0,
        imbalance: imbalance(buy, sell),
      };
    });
  }

  async ensureStarted(): Promise<void> {
    if (this.status === "connected" || this.status === "connecting") {
      return this.starting ?? Promise.resolve();
    }
    this.stopRequested = false;
    this.starting = this.connect().finally(() => {
      this.starting = null;
    });
    return this.starting;
  }

  stop(): void {
    this.stopRequested = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      try {
        this.ws.removeAllListeners();
        this.ws.close();
      } catch {
        /* ignore */
      }
      this.ws = null;
    }
    this.status = "idle";
  }

  private getAccessToken(): string {
    const token = process.env.UPSTOX_ACCESS_TOKEN?.trim();
    if (!token) {
      throw new Error(
        "UPSTOX_ACCESS_TOKEN is not set. Add it to .env.local and restart.",
      );
    }
    return token;
  }

  private async loadProto(): Promise<protobuf.Type> {
    if (this.FeedResponse) return this.FeedResponse;
    const root = await protobuf.load(PROTO_PATH);
    this.FeedResponse = root.lookupType(
      "com.upstox.marketdatafeederv3udapi.rpc.proto.FeedResponse",
    );
    return this.FeedResponse;
  }

  private async authorizeUrl(): Promise<string> {
    const token = this.getAccessToken();
    const res = await fetch(AUTHORIZE_URL, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`Feed authorize failed (${res.status}): ${text.slice(0, 180)}`);
    }
    const json = JSON.parse(text) as {
      data?: { authorized_redirect_uri?: string; authorizedRedirectUri?: string };
    };
    const uri =
      json.data?.authorized_redirect_uri ?? json.data?.authorizedRedirectUri;
    if (!uri) throw new Error("Feed authorize response missing redirect URI");
    return uri;
  }

  private async connect(): Promise<void> {
    this.status = "connecting";
    this.error = null;
    try {
      await this.loadProto();
      const equities = await loadFoEquityInstruments(false);
      this.equities = [...equities.values()];
      this.keyToSymbol.clear();
      for (const eq of this.equities) {
        this.keyToSymbol.set(eq.instrumentKey, eq.symbol);
        this.keyToSymbol.set(eq.instrumentKey.replace(/\|/g, ":"), eq.symbol);
      }

      const wsUrl = await this.authorizeUrl();
      await this.openSocket(wsUrl);
      this.status = "connected";
      this.reconnectAttempt = 0;
      this.emit("status", this.snapshot());
    } catch (e) {
      this.status = "error";
      this.error = e instanceof Error ? e.message : String(e);
      this.emit("status", this.snapshot());
      this.scheduleReconnect();
      throw e;
    }
  }

  private openSocket(wsUrl: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(wsUrl, { followRedirects: true });
      this.ws = ws;
      let opened = false;
      const connectTimer = setTimeout(() => {
        if (opened) return;
        try {
          ws.terminate();
        } catch {
          /* ignore */
        }
        reject(new Error("WebSocket connect timed out"));
      }, 10_000);

      ws.on("open", () => {
        opened = true;
        clearTimeout(connectTimer);
        this.subscribeAll(ws);
        resolve();
      });

      ws.on("message", (data) => {
        try {
          this.onMessage(data);
        } catch (e) {
          console.error("upstox feed decode error", e);
        }
      });

      ws.on("error", (err) => {
        this.error = err.message;
        if (!opened) {
          clearTimeout(connectTimer);
          reject(err);
        }
        this.emit("status", this.snapshot());
      });

      ws.on("close", () => {
        this.ws = null;
        if (this.stopRequested) {
          this.status = "idle";
          return;
        }
        this.status = "error";
        this.error = this.error ?? "WebSocket closed";
        this.emit("status", this.snapshot());
        this.scheduleReconnect();
      });
    });
  }

  private subscribeAll(ws: WebSocket) {
    const keys = this.equities.map((e) => e.instrumentKey);
    this.subscribed = keys.length;
    // Upstox accepts large batches; chunk defensively.
    const chunkSize = 400;
    for (let i = 0; i < keys.length; i += chunkSize) {
      const instrumentKeys = keys.slice(i, i + chunkSize);
      const payload = {
        guid: `ob-${Date.now()}-${i}`,
        method: "sub",
        data: { mode: "full", instrumentKeys },
      };
      ws.send(Buffer.from(JSON.stringify(payload)));
    }
  }

  private scheduleReconnect() {
    if (this.stopRequested || this.reconnectTimer) return;
    const delay = Math.min(
      MAX_RECONNECT_MS,
      RECONNECT_MS * Math.pow(1.5, this.reconnectAttempt),
    );
    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.ensureStarted().catch(() => {
        /* already scheduled again from connect */
      });
    }, delay);
  }

  private onMessage(raw: WebSocket.RawData) {
    if (!this.FeedResponse) return;
    const buf = Buffer.isBuffer(raw)
      ? raw
      : Array.isArray(raw)
        ? Buffer.concat(raw)
        : Buffer.from(raw as ArrayBuffer);
    const message = this.FeedResponse.decode(buf);
    const obj = this.FeedResponse.toObject(message, {
      longs: Number,
      enums: String,
      defaults: true,
    }) as DecodedFeed;

    this.lastMessageAt = Date.now();
    this.ticks += 1;

    if (obj.marketInfo?.segmentStatus) {
      const next: Record<string, string> = {};
      for (const [k, v] of Object.entries(obj.marketInfo.segmentStatus)) {
        next[k] = String(v);
      }
      this.marketInfo = next;
    }

    const feeds = obj.feeds ?? {};
    let changed = false;
    for (const [key, feed] of Object.entries(feeds)) {
      const tick = this.parseFeed(key, feed);
      if (!tick) continue;
      this.books.set(tick.symbol, tick);
      changed = true;
      this.emit("tick", tick);
    }
    if (changed) this.emit("books", this.snapshot());
  }

  private parseFeed(
    key: string,
    feed: DecodedInstrumentFeed,
  ): BookPressureTick | null {
    const symbol =
      this.keyToSymbol.get(key) ??
      this.keyToSymbol.get(key.replace(/:/g, "|")) ??
      null;
    if (!symbol) return null;

    const meta = symbolMap.get(symbol) ?? FO_STOCKS.find((s) => s.symbol === symbol);
    const marketFF = feed.fullFeed?.marketFF;
    const first = feed.firstLevelWithGreeks;
    const ltpc = marketFF?.ltpc ?? first?.ltpc ?? feed.ltpc;
    const ltp = Number(ltpc?.ltp ?? 0);
    const close = Number(ltpc?.cp ?? 0);
    const changePct =
      close > 0 && Number.isFinite(ltp) ? ((ltp - close) / close) * 100 : 0;

    let bidQty = 0;
    let askQty = 0;
    let bidPrice = 0;
    let askPrice = 0;

    const levels = marketFF?.marketLevel?.bidAskQuote ?? [];
    if (levels.length) {
      for (const q of levels) {
        bidQty += num(q.bidQ);
        askQty += num(q.askQ);
      }
      bidPrice = Number(levels[0]?.bidP ?? 0);
      askPrice = Number(levels[0]?.askP ?? 0);
    } else if (first?.firstDepth) {
      bidQty = num(first.firstDepth.bidQ);
      askQty = num(first.firstDepth.askQ);
      bidPrice = Number(first.firstDepth.bidP ?? 0);
      askPrice = Number(first.firstDepth.askP ?? 0);
    }

    const totalBuyQty = Number(marketFF?.tbq ?? 0);
    const totalSellQty = Number(marketFF?.tsq ?? 0);
    const buy = totalBuyQty > 0 || totalSellQty > 0 ? totalBuyQty : bidQty;
    const sell = totalBuyQty > 0 || totalSellQty > 0 ? totalSellQty : askQty;
    const volumeTradedToday = num(marketFF?.vtt ?? first?.vtt);
    const lastTradeQty = num(ltpc?.ltq);
    const avgTradedPrice = Number(marketFF?.atp ?? 0);

    return {
      symbol,
      name: meta?.name ?? symbol,
      sector: meta?.sector ?? "",
      instrumentKey: key.includes("|") ? key : key.replace(/:/g, "|"),
      ltp,
      close,
      changePct: +changePct.toFixed(3),
      bidQty,
      askQty,
      bidPrice,
      askPrice,
      totalBuyQty,
      totalSellQty,
      imbalance: +imbalance(buy, sell).toFixed(4),
      volumeTradedToday,
      lastTradeQty,
      avgTradedPrice,
      updatedAt: Date.now(),
    };
  }
}

export function getMarketDataFeed(): UpstoxMarketDataFeed {
  const existing = globalThis.__orderblockUpstoxFeed;
  // Drop stale HMR instances that predate newer methods.
  if (existing && typeof existing.getAllBooks === "function") {
    return existing;
  }
  if (existing) {
    try {
      existing.stop();
    } catch {
      /* ignore */
    }
  }
  globalThis.__orderblockUpstoxFeed = new UpstoxMarketDataFeed();
  return globalThis.__orderblockUpstoxFeed;
}
