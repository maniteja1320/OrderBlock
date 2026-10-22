import { NextResponse } from "next/server";
import { computeFlowBoard } from "@/lib/flowBoard";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const force = searchParams.get("force") === "1";
  try {
    const data = await computeFlowBoard(force);
    return NextResponse.json(data);
  } catch (error) {
    console.error("flow board error", error);
    return NextResponse.json(
      { error: "Failed to load flow board" },
      { status: 500 },
    );
  }
}
