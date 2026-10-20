import { NextResponse } from "next/server";
import { computeStructureBoard } from "@/lib/structureBoard";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const force = searchParams.get("force") === "1";
  try {
    const data = await computeStructureBoard(force);
    return NextResponse.json(data);
  } catch (error) {
    console.error("structure board error", error);
    return NextResponse.json(
      { error: "Failed to load structure board" },
      { status: 500 },
    );
  }
}
