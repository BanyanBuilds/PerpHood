import { NextResponse } from "next/server";
import { v48DataPlaneStatus } from "@/lib/server/v48-data-plane.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try { return NextResponse.json({ ok: true, ...v48DataPlaneStatus() }, { headers: { "cache-control": "no-store" } }); }
  catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "V48 status failed." }, { status: 500, headers: { "cache-control": "no-store" } }); }
}
