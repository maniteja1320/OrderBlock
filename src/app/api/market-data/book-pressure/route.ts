import { NextResponse } from "next/server";
import { ensureBookSnapshotScheduler } from "@/lib/upstox/bookSnapshots";
import { getMarketDataFeed } from "@/lib/upstox/marketDataFeed";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  ensureBookSnapshotScheduler();

  if (!process.env.UPSTOX_ACCESS_TOKEN?.trim()) {
    return NextResponse.json(
      {
        updatedAt: new Date().toISOString(),
        connected: false,
        subscribed: 0,
        ticks: 0,
        lastMessageAt: null,
        error:
          "UPSTOX_ACCESS_TOKEN missing. Add it to .env.local and restart the server.",
        marketInfo: {},
        bullish: [],
        bearish: [],
      },
      { status: 503 },
    );
  }

  const feed = getMarketDataFeed();
  try {
    await feed.ensureStarted();
  } catch (e) {
    // Still return snapshot with error — reconnect continues in background.
    console.error("book-pressure start", e);
  }
  return NextResponse.json(feed.snapshot());
}
