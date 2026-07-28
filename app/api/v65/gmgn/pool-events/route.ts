import { NextResponse } from "next/server";
import { listV65PoolEvents } from "@/lib/server/v65-gmgn-live";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const result = await listV65PoolEvents({ pool: url.searchParams.get("pool") ?? undefined, token: url.searchParams.get("token") ?? undefined, limit: Number(url.searchParams.get("limit") ?? 250) });
    return NextResponse.json({ ok: true, ...result }, { headers: { "access-control-allow-origin": "*", "cache-control": "public, max-age=10, s-maxage=20" } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "V65 pool-event feed failed." }, { status: 500 });
  }
}
