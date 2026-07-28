import { NextResponse } from "next/server";
import { listV63GmgnLaunches } from "@/lib/server/v63-gmgn-feed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const result = await listV63GmgnLaunches({
      limit: Number(url.searchParams.get("limit") ?? 250),
      token: url.searchParams.get("token") ?? undefined,
      creator: url.searchParams.get("creator") ?? undefined,
      fromBlock: Number(url.searchParams.get("fromBlock") ?? 0),
    });
    return NextResponse.json({ ok: true, ...result }, {
      headers: {
        "access-control-allow-origin": "*",
        "cache-control": "public, max-age=10, s-maxage=30, stale-while-revalidate=60",
      },
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "GMGN launch feed failed." }, { status: 500 });
  }
}
