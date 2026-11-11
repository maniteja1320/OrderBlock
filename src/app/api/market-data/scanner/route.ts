import { NextResponse } from "next/server";
import {
  ensureScannerStarted,
  getImbalanceScanner,
} from "@/lib/scanner/engine";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  if (!process.env.UPSTOX_ACCESS_TOKEN?.trim()) {
    return NextResponse.json(
      {
        error:
          "UPSTOX_ACCESS_TOKEN missing. Add it to .env.local and restart the server.",
        paperTradingOnly: true,
        longSignals: [],
        shortSignals: [],
        alerts: [],
        positions: [],
      },
      { status: 503 },
    );
  }
  return NextResponse.json(ensureScannerStarted());
}

/** Open a paper position from the latest signal — never places a live order. */
export async function POST(request: Request) {
  if (!process.env.UPSTOX_ACCESS_TOKEN?.trim()) {
    return NextResponse.json(
      { error: "UPSTOX_ACCESS_TOKEN missing" },
      { status: 503 },
    );
  }
  ensureScannerStarted();
  let symbol = "";
  try {
    const body = (await request.json()) as { symbol?: string; action?: string };
    symbol = (body.symbol || "").toUpperCase();
    if (body.action && body.action !== "paper-open") {
      return NextResponse.json(
        { error: "Only action=paper-open is supported (no live orders)." },
        { status: 400 },
      );
    }
  } catch {
    return NextResponse.json({ error: "Expected JSON { symbol }" }, { status: 400 });
  }
  if (!symbol) {
    return NextResponse.json({ error: "symbol required" }, { status: 400 });
  }

  const pos = getImbalanceScanner().openPaper(symbol);
  if (!pos) {
    return NextResponse.json(
      {
        error:
          "No paper open — need an active LONG/SHORT signal, free slot, and no duplicate.",
      },
      { status: 409 },
    );
  }
  return NextResponse.json({
    paperTradingOnly: true,
    position: pos,
    dashboard: getImbalanceScanner().snapshot(),
  });
}
