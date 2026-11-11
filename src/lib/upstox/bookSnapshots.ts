import { mkdir, readdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { getIstClock, isTradingSessionDay } from "../marketHours";
import {
  getMarketDataFeed,
  type BookPressureBoard,
  type BookPressureTick,
} from "./marketDataFeed";

export type BookSnapshotKind = "close" | "manual";

export interface BookSnapshotFile {
  kind: BookSnapshotKind;
  istDate: string;
  capturedAt: string;
  capturedAtIst: string;
  connected: boolean;
  subscribed: number;
  ticks: number;
  bookCount: number;
  marketInfo: Record<string, string>;
  books: BookPressureTick[];
  board: BookPressureBoard;
}

export interface BookSnapshotMeta {
  kind: BookSnapshotKind;
  istDate: string;
  capturedAt: string;
  capturedAtIst: string;
  bookCount: number;
  file: string;
}

const DIR = path.join(process.cwd(), "data", "book-snapshots");

function fileName(istDate: string, kind: BookSnapshotKind): string {
  return `${istDate}-${kind}.json`;
}

function filePath(istDate: string, kind: BookSnapshotKind): string {
  return path.join(DIR, fileName(istDate, kind));
}

async function ensureDir() {
  await mkdir(DIR, { recursive: true });
}

function formatIstLabel(now = new Date()): string {
  return now.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      p,
      new Promise<T>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`Timed out after ${ms}ms`)),
          ms,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function captureBookSnapshot(
  kind: BookSnapshotKind = "manual",
): Promise<BookSnapshotFile> {
  const feed = getMarketDataFeed();
  try {
    await withTimeout(feed.ensureStarted(), 12_000);
  } catch (e) {
    console.warn(
      "[book-snapshot] feed start skipped:",
      e instanceof Error ? e.message : e,
    );
  }

  // Give the initial_feed a moment if we just connected empty.
  if (feed.getAllBooks().length === 0) {
    await new Promise((r) => setTimeout(r, 2000));
  }

  const clock = getIstClock();
  const books = feed
    .getAllBooks()
    .sort((a, b) => a.symbol.localeCompare(b.symbol));
  const board = feed.snapshot(20);
  const payload: BookSnapshotFile = {
    kind,
    istDate: clock.date,
    capturedAt: new Date().toISOString(),
    capturedAtIst: formatIstLabel(),
    connected: feed.status === "connected",
    subscribed: feed.subscribed,
    ticks: feed.ticks,
    bookCount: books.length,
    marketInfo: { ...feed.marketInfo },
    books,
    board,
  };

  await ensureDir();
  const out = filePath(clock.date, kind);
  await writeFile(out, JSON.stringify(payload), "utf8");
  console.info(
    `[book-snapshot] wrote ${out} (${payload.bookCount} books, kind=${kind})`,
  );
  return payload;
}

export async function readBookSnapshot(
  istDate: string,
  kind: BookSnapshotKind = "close",
): Promise<BookSnapshotFile | null> {
  try {
    const text = await readFile(filePath(istDate, kind), "utf8");
    return JSON.parse(text) as BookSnapshotFile;
  } catch {
    return null;
  }
}

export async function listBookSnapshots(): Promise<BookSnapshotMeta[]> {
  try {
    await ensureDir();
    const files = await readdir(DIR);
    const out: BookSnapshotMeta[] = [];
    for (const file of files) {
      const m = file.match(/^(\d{4}-\d{2}-\d{2})-(close|manual)\.json$/);
      if (!m) continue;
      try {
        const raw = JSON.parse(
          await readFile(path.join(DIR, file), "utf8"),
        ) as BookSnapshotFile;
        out.push({
          kind: raw.kind,
          istDate: raw.istDate,
          capturedAt: raw.capturedAt,
          capturedAtIst: raw.capturedAtIst,
          bookCount: raw.bookCount,
          file,
        });
      } catch {
        out.push({
          kind: m[2] as BookSnapshotKind,
          istDate: m[1],
          capturedAt: "",
          capturedAtIst: "",
          bookCount: 0,
          file,
        });
      }
    }
    return out.sort((a, b) =>
      b.istDate.localeCompare(a.istDate) || b.kind.localeCompare(a.kind),
    );
  } catch {
    return [];
  }
}

export async function latestCloseSnapshot(): Promise<BookSnapshotFile | null> {
  const list = await listBookSnapshots();
  const close = list.find((s) => s.kind === "close");
  if (close) return readBookSnapshot(close.istDate, "close");
  const any = list[0];
  if (!any) return null;
  return readBookSnapshot(any.istDate, any.kind);
}

declare global {
  // eslint-disable-next-line no-var
  var __orderblockBookSnapScheduler: { started: boolean } | undefined;
}

/**
 * Auto-capture close book at 15:29–15:30 IST on trading days.
 * Requires the Next.js server to be running through the close.
 */
export function ensureBookSnapshotScheduler(): void {
  if (globalThis.__orderblockBookSnapScheduler?.started) return;
  globalThis.__orderblockBookSnapScheduler = { started: true };

  const tick = async () => {
    try {
      const clock = getIstClock();
      const mins = clock.hour * 60 + clock.minute;

      // Warm the feed before close so depth is populated.
      if (
        isTradingSessionDay() &&
        mins >= 15 * 60 + 20 &&
        mins <= 15 * 60 + 30
      ) {
        const feed = getMarketDataFeed();
        if (feed.status !== "connected" && feed.status !== "connecting") {
          void feed.ensureStarted().catch(() => undefined);
        }
      }

      // Capture window: 15:29:00 – 15:30:59 IST.
      if (
        isTradingSessionDay() &&
        mins >= 15 * 60 + 29 &&
        mins <= 15 * 60 + 30
      ) {
        const existing = await readBookSnapshot(clock.date, "close");
        if (existing) return;
        await captureBookSnapshot("close");
        console.info(
          `[book-snapshot] saved close snapshot for ${clock.date} (${formatIstLabel()})`,
        );
      }
    } catch (e) {
      console.error("[book-snapshot] scheduler error", e);
    }
  };

  void tick();
  setInterval(tick, 10_000);
}
