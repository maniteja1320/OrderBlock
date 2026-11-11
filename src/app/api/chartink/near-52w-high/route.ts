import { NextResponse } from "next/server";
import { computeNear52WeekHigh } from "@/lib/near52WeekHigh";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const force = searchParams.get("force") === "1";
    const data = await computeNear52WeekHigh(force);
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
          e instanceof Error ? e.message : "Near 52 week high failed",
      },
      { status: 500 },
    );
  }
}
