import { NextResponse } from "next/server";
import { v63Manifest } from "@/lib/server/v63-gmgn-feed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return NextResponse.json(v63Manifest(new URL(request.url).origin), {
    headers: {
      "access-control-allow-origin": "*",
      "cache-control": "public, max-age=60, s-maxage=300, stale-while-revalidate=600",
    },
  });
}
