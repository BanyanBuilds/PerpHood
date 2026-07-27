import { NextResponse } from "next/server";
import { readV59MainnetReadiness } from "@/lib/server/v59-mainnet-readiness";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const readiness = await readV59MainnetReadiness();
  const ok = readiness.chain.rpcHealthy && (!readiness.factory.configured || readiness.factory.codePresent);
  return NextResponse.json({ ok, ...readiness }, {
    status: ok ? 200 : 503,
    headers: { "cache-control": "no-store, max-age=0" },
  });
}
