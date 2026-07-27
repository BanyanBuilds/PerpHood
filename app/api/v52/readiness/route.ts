import { NextResponse } from "next/server";
import { readV52RuntimeReadiness } from "@/lib/server/v52-readiness";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ ok: true, ...readV52RuntimeReadiness() }, { headers: { "cache-control": "no-store" } });
}
