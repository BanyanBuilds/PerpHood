import { NextRequest, NextResponse } from "next/server";
import { readV89ProtocolStats } from "@/lib/server/v89-protocol-stats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const chainId = Number(request.nextUrl.searchParams.get("chainId") ?? process.env.ROBINHOOD_CHAIN_ID ?? "46630");
    if (!Number.isSafeInteger(chainId) || chainId <= 0) return NextResponse.json({ ok:false, error:"Invalid chainId." }, { status:400 });
    return NextResponse.json({ ok:true, ...readV89ProtocolStats(chainId) }, { headers:{ "Cache-Control":"no-store" } });
  } catch (error) {
    return NextResponse.json({ ok:false, error:error instanceof Error ? error.message : "Unable to read protocol stats." }, { status:500 });
  }
}
