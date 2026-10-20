import { NextResponse } from "next/server";
import { computeSmartMoneyScan } from "@/lib/rankings";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const force = searchParams.get("force") === "1";
  try {
    const data = await computeSmartMoneyScan(force);
    return NextResponse.json(data);
  } catch (error) {
    console.error("smart-money scan error", error);
    return NextResponse.json(
      { error: "Failed to compute smart money scan" },
      { status: 500 },
    );
  }
}
