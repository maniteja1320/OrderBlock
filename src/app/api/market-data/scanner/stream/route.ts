import {
  ensureScannerStarted,
  getImbalanceScanner,
  type ScannerDashboard,
} from "@/lib/scanner/engine";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
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

  const scanner = getImbalanceScanner();
  ensureScannerStarted();
  const encoder = new TextEncoder();
  let closed = false;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let onDash: ((d: ScannerDashboard) => void) | null = null;

  const stream = new ReadableStream({
    start(controller) {
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
        if (onDash) scanner.off("dashboard", onDash);
        if (heartbeat) clearInterval(heartbeat);
        try {
          controller.close();
        } catch {
          /* ignore */
        }
      };

      onDash = (d) => send(d);
      scanner.on("dashboard", onDash);
      request.signal.addEventListener("abort", cleanup);
      send(scanner.snapshot());

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
      if (onDash) scanner.off("dashboard", onDash);
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
