import { NextResponse } from "next/server";
import {
  BEARISH_CONDITIONS,
  BULLISH_CONDITIONS,
} from "@/lib/expansionConditions";
import { computeExpansionSideScan } from "@/lib/expansionScan";
import type { Side } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sideParam = searchParams.get("side");
  const force = searchParams.get("force") === "1";

  // Meta-only: conditions for the UI without scanning
  if (!sideParam) {
    return NextResponse.json({
      conditions: {
        bullish: BULLISH_CONDITIONS,
        bearish: BEARISH_CONDITIONS,
      },
    });
  }

  if (sideParam !== "bullish" && sideParam !== "bearish") {
    return NextResponse.json(
      { error: "side must be bullish or bearish" },
      { status: 400 },
    );
  }

  try {
    const data = await computeExpansionSideScan(sideParam as Side, force);
    return NextResponse.json(data);
  } catch (error) {
    console.error("smart-money expansion scan error", error);
    return NextResponse.json(
      { error: "Failed to compute expansion scan" },
      { status: 500 },
    );
  }
}
