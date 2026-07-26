import { NextResponse } from "next/server";
import { getV48ChainConfig } from "@/lib/server/v48-chain-config.ts";
import { v48MarketDataSnapshot } from "@/lib/server/v48-materializer.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ market: string }> }) {
  try {
    const { market } = await context.params;
    if (!/^0x[0-9a-fA-F]{40}$/.test(market)) throw new Error("Market address is invalid.");
    const url = new URL(request.url);
    const interval = Number(url.searchParams.get("interval") ?? 1);
    if (![1,15,30].includes(interval)) throw new Error("Interval must be 1, 15, or 30 seconds.");
    const limit = Math.min(5_000, Math.max(1, Number(url.searchParams.get("limit") ?? 500)));
    const config = getV48ChainConfig();
    return NextResponse.json({ ok: true, version: 48, chainId: config.chainId, market: market.toLowerCase(), ...v48MarketDataSnapshot({ chainId: config.chainId, market, intervalSeconds: interval as 1|15|30, limit }) }, { headers: { "cache-control": "no-store" } });
  } catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "V48 market data failed." }, { status: 400, headers: { "cache-control": "no-store" } }); }
}
