import { NextResponse } from "next/server";
import { listV65GmgnLaunches, v65Manifest } from "@/lib/server/v65-gmgn-live";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const origin = new URL(request.url).origin;
    const { configured, launches } = await listV65GmgnLaunches({ limit: 1 });
    const canary = launches[0] ?? null;
    return NextResponse.json({
      ok: true,
      configured,
      manifest: v65Manifest(origin),
      canary,
      evidenceReady: Boolean(canary?.tokenAddress && canary?.poolAddress && canary?.transactionHash),
      requiredExternalProof: ["verified factory and locker", "canonical pool", "creator launch transaction", "independent-wallet buy", "independent-wallet sell", "GMGN contract search result"],
    }, { headers: { "access-control-allow-origin": "*", "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "V65 evidence feed failed." }, { status: 500 });
  }
}
