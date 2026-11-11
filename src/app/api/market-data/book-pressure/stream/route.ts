import { ensureBookSnapshotScheduler } from "@/lib/upstox/bookSnapshots";
import {
  getMarketDataFeed,
  type BookPressureBoard,
} from "@/lib/upstox/marketDataFeed";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  ensureBookSnapshotScheduler();

  if (!process.env.UPSTOX_ACCESS_TOKEN?.trim()) {
    return new Response(
      `data: ${JSON.stringify({ error: "UPSTOX_ACCESS_TOKEN missing" })}\n\n`,
      {
        status: 503,
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
        },
      },
    );
  }

  const feed = getMarketDataFeed();
  const encoder = new TextEncoder();
  let closed = false;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let onBooks: ((board: BookPressureBoard) => void) | null = null;
  let onStatus: ((board: BookPressureBoard) => void) | null = null;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(payload)}\n\n`),
          );
        } catch {
          cleanup();
        }
      };

      const cleanup = () => {
        if (closed) return;
        closed = true;
        if (onBooks) feed.off("books", onBooks);
        if (onStatus) feed.off("status", onStatus);
        if (heartbeat) clearInterval(heartbeat);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      onBooks = (board) => send(board);
      onStatus = (board) => send(board);
      feed.on("books", onBooks);
      feed.on("status", onStatus);

      request.signal.addEventListener("abort", cleanup);

      try {
        await feed.ensureStarted();
      } catch {
        /* error already on snapshot */
      }
      send(feed.snapshot());

      heartbeat = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch {
          cleanup();
        }
      }, 15_000);
    },
    cancel() {
      if (onBooks) feed.off("books", onBooks);
      if (onStatus) feed.off("status", onStatus);
      if (heartbeat) clearInterval(heartbeat);
      closed = true;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
