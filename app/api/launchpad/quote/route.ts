import { NextResponse } from "next/server";
import { estimateMigrationTarget, quoteLaunchSpend } from "@/lib/launchpad";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { totalSpendEth?: number; gasReserveEth?: number; targetMarketCapUsd?: number; ethUsd?: number };
    const launch = quoteLaunchSpend(Number(body.totalSpendEth ?? 0), Number(body.gasReserveEth ?? 0.00018));
    const migration = estimateMigrationTarget(Number(body.targetMarketCapUsd ?? 45_000), Number(body.ethUsd ?? 3_200));
    return NextResponse.json({ launch, migration });
  } catch {
    return NextResponse.json({ error: "Invalid launchpad quote request." }, { status: 400 });
  }
}
