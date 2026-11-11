import { NextResponse } from "next/server";
import { computeChartinkBoard } from "@/lib/chartinkBoard";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const force = searchParams.get("force") === "1";
    const data = await computeChartinkBoard(force);
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json(
      {
        updatedAt: new Date().toISOString(),
        error: e instanceof Error ? e.message : "Chartink board failed",
      },
      { status: 500 },
    );
  }
}
