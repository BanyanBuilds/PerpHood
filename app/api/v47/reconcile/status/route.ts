import { NextResponse } from "next/server";
import { recentV47Reconciliation } from "@/lib/server/v47-reconciler.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ ok: true, version: 47, reconciliation: recentV47Reconciliation() }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "V47 reconciliation status failed." }, { status: 500, headers: { "cache-control": "no-store" } });
  }
}
