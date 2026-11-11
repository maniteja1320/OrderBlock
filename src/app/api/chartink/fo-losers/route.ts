import { NextResponse } from "next/server";
import { computeFoLosers } from "@/lib/foGainers";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const force = searchParams.get("force") === "1";
    const data = await computeFoLosers(force);
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json(
      {
        updatedAt: new Date().toISOString(),
        universe: 0,
        scanned: 0,
        rows: [],
        source: "upstox",
        error: e instanceof Error ? e.message : "F&O losers failed",
      },
      { status: 500 },
    );
  }
}
