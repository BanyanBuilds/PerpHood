import { NextResponse } from "next/server";
import { getV85LiveHealth } from "@/lib/server/v85-live-event-hub";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ ok: true, service: "leveragex-live-data-v85", ...getV85LiveHealth(), checkedAt: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
}
