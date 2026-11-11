import { NextResponse } from "next/server";
import { computeOiBuildUpBoard } from "@/lib/oiBuildUpBoard";

export const dynamic = "force-dynamic";
export const maxDuration = 300;
export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const force = searchParams.get("force") === "1";

  try {
    const data = await computeOiBuildUpBoard(force);
    const status = data.error ? 503 : 200;
    return NextResponse.json(data, { status });
  } catch (error) {
    console.error("market-data error", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to load market data",
      },
      { status: 500 },
    );
  }
}
