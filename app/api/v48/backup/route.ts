import { NextResponse } from "next/server";
import { createV48DatabaseSnapshot } from "@/lib/server/v48-backup.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(request: Request) {
  const expected = process.env.V48_BACKUP_SECRET ?? process.env.V48_DATA_PLANE_SECRET;
  if (!expected) return process.env.NODE_ENV !== "production";
  return request.headers.get("authorization") === `Bearer ${expected}`;
}
export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ ok: false, error: "Unauthorized backup request." }, { status: 401 });
  try { return NextResponse.json({ ok: true, snapshot: createV48DatabaseSnapshot({ metadata: { requestedBy: "api" } }) }); }
  catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "V48 backup failed." }, { status: 400 }); }
}
