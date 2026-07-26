import { NextResponse } from "next/server";
import { replicateV48FinalizedState } from "@/lib/server/v48-replication.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(request: Request) {
  const expected = process.env.V48_REPLICATION_SECRET ?? process.env.V48_DATA_PLANE_SECRET;
  if (!expected) return process.env.NODE_ENV !== "production";
  return request.headers.get("authorization") === `Bearer ${expected}`;
}
export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ ok: false, error: "Unauthorized replication request." }, { status: 401 });
  try { return NextResponse.json({ ok: true, result: await replicateV48FinalizedState() }); }
  catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "V48 replication failed." }, { status: 400 }); }
}
