import { NextResponse } from "next/server";
import { computeRankings } from "@/lib/rankings";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const force = searchParams.get("force") === "1";

  try {
    const data = await computeRankings(force);
    return NextResponse.json(data);
  } catch (error) {
    console.error("rankings error", error);
    return NextResponse.json(
      { error: "Failed to compute rankings" },
      { status: 500 },
    );
  }
}
