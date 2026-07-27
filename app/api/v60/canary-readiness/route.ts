import { NextResponse } from "next/server";
import { readV60CanaryReadiness } from "@/lib/server/v60-canary-readiness";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const readiness = await readV60CanaryReadiness();
  const ok = readiness.gates.rpcReady && (!readiness.factory.configured || readiness.factory.codePresent);
  return NextResponse.json({ ok, ...readiness }, {
    status: ok ? 200 : 503,
    headers: { "cache-control": "no-store, max-age=0" },
  });
}
