import { NextResponse } from "next/server";
import { listV65GmgnLaunches } from "@/lib/server/v65-gmgn-live";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const result = await listV65GmgnLaunches({ limit: Number(url.searchParams.get("limit") ?? 250), token: url.searchParams.get("token") ?? undefined, creator: url.searchParams.get("creator") ?? undefined, fromBlock: Number(url.searchParams.get("fromBlock") ?? 0) });
    return NextResponse.json({ ok: true, ...result }, { headers: { "access-control-allow-origin": "*", "cache-control": "public, max-age=15, s-maxage=30" } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "V65 GMGN launch feed failed." }, { status: 500 });
  }
}
