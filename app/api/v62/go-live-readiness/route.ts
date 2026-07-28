import { NextResponse } from "next/server";
import { readV62GoLiveReadiness } from "@/lib/server/v62-go-live-readiness";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const readiness = await readV62GoLiveReadiness();
  return NextResponse.json(readiness, {
    status: readiness.gates.rpcReady ? 200 : 503,
    headers: { "cache-control": "no-store" },
  });
}
