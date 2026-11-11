import { NextResponse } from "next/server";
import { computeNarrowCpr } from "@/lib/narrowCpr";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const force = searchParams.get("force") === "1";
    const data = await computeNarrowCpr(force);
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json(
      {
        updatedAt: new Date().toISOString(),
        universe: 0,
        scanned: 0,
        rows: [],
        source: "upstox",
        error:
          e instanceof Error ? e.message : "Intraday Narrow CPR failed",
      },
      { status: 500 },
    );
  }
}
