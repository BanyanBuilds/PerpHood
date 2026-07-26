import { NextResponse } from "next/server";
import { runV48DataPlaneCycle } from "@/lib/server/v48-data-plane.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(request: Request) {
  const expected = process.env.V48_DATA_PLANE_SECRET ?? process.env.V47_INDEXER_SECRET;
  if (!expected) return process.env.NODE_ENV !== "production";
  return request.headers.get("authorization") === `Bearer ${expected}`;
}

export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ ok: false, error: "Unauthorized V48 data-plane request." }, { status: 401 });
  try {
    const body = await request.json().catch(() => ({})) as { skipIndexer?: boolean };
    const result = await runV48DataPlaneCycle(body);
    return NextResponse.json({ ok: true, result }, { headers: { "cache-control": "no-store" } });
  } catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "V48 data-plane cycle failed." }, { status: 400, headers: { "cache-control": "no-store" } }); }
}
