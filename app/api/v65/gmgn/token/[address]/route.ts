import { NextResponse } from "next/server";
import { listV65GmgnLaunches } from "@/lib/server/v65-gmgn-live";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(_: Request, context: { params: Promise<{ address: string }> }) {
  try {
    const { address } = await context.params;
    if (!/^0x[0-9a-fA-F]{40}$/.test(address)) return NextResponse.json({ ok: false, error: "Invalid token address." }, { status: 400 });
    const result = await listV65GmgnLaunches({ token: address, limit: 1 });
    const token = result.launches[0];
    if (!token) return NextResponse.json({ ok: false, configured: result.configured, error: "Leverage X V65 token not found." }, { status: 404 });
    return NextResponse.json({ ok: true, configured: result.configured, token }, { headers: { "access-control-allow-origin": "*", "cache-control": "public, max-age=15, s-maxage=30" } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "V65 token lookup failed." }, { status: 500 });
  }
}
