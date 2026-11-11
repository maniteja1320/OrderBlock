import { NextResponse } from "next/server";
import { computeRFactorBoard } from "@/lib/rFactorBoard";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const force = searchParams.get("force") === "1";
    const data = await computeRFactorBoard(force);
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json(
      {
        updatedAt: new Date().toISOString(),
        universe: 0,
        scored: 0,
        rows: [],
        error: e instanceof Error ? e.message : "R-factor board failed",
      },
      { status: 500 },
    );
  }
}
