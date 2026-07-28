import { NextResponse } from "next/server";
import { v65Manifest } from "@/lib/server/v65-gmgn-live";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  return NextResponse.json(v65Manifest(new URL(request.url).origin), { headers: { "access-control-allow-origin": "*", "cache-control": "public, max-age=120, s-maxage=300" } });
}
