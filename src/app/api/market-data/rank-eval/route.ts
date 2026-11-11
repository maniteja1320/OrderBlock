import { NextResponse } from "next/server";
import {
  compareVariants,
  pickBestLookback,
  runStructureCalibration,
} from "@/lib/rankEval/evaluate";
import { TRUE_TOP10_2026_11_05 } from "@/lib/rankEval/fixtures";
import type { IntradayInterval } from "@/lib/upstox/equityCandles";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: Request) {
  if (!process.env.UPSTOX_ACCESS_TOKEN?.trim()) {
    return NextResponse.json(
      { error: "UPSTOX_ACCESS_TOKEN missing" },
      { status: 503 },
    );
  }

  const { searchParams } = new URL(request.url);
  const sessionDate =
    searchParams.get("date") ?? TRUE_TOP10_2026_11_05.date;
  const timeframe = (searchParams.get("tf") ?? "5minute") as IntradayInterval;
  const force = searchParams.get("force") === "1";
  const lookbackParam = searchParams.get("lookback");

  try {
    // Default: use lookback=3 unless picking; full pick+compare is heavy — prefer script.
    const doPick = searchParams.get("pick") === "1" || !lookbackParam;
    const lookbackPick = doPick
      ? await pickBestLookback({ sessionDate, timeframe })
      : null;
    const lookback = lookbackParam
      ? Number(lookbackParam)
      : (lookbackPick?.best.lookback ?? 3);

    const calibration = await runStructureCalibration({
      sessionDate,
      timeframe,
      lookback,
    });

    const compare = await compareVariants({
      sessionDate,
      timeframe,
      lookback,
      force,
    });

    return NextResponse.json({
      sessionDate,
      timeframe,
      lookback,
      lookbackPick: lookbackPick?.all.map((a) => ({
        lookback: a.lookback,
        passed: a.passed,
        total: a.total,
        results: a.results,
      })),
      calibration,
      compare,
    });
  } catch (e) {
    console.error("rank-eval", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "rank-eval failed" },
      { status: 500 },
    );
  }
}
