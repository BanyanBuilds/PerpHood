import { NextResponse } from "next/server";
import { listV63GmgnLaunches } from "@/lib/server/v63-gmgn-feed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ address: string }> }) {
  const { address } = await context.params;
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) return NextResponse.json({ ok: false, error: "Invalid token address." }, { status: 400 });
  try {
    const result = await listV63GmgnLaunches({ token: address, limit: 1 });
    const launch = result.launches[0];
    if (!launch) return NextResponse.json({ ok: false, configured: result.configured, error: "Leverage X token not found." }, { status: 404 });
    return NextResponse.json({ ok: true, configured: result.configured, launch }, {
      headers: { "access-control-allow-origin": "*", "cache-control": "public, max-age=15, s-maxage=60" },
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "GMGN token lookup failed." }, { status: 500 });
  }
}
