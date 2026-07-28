import { NextResponse } from "next/server";
import { readV64FirstLaunchReadiness } from "@/lib/server/v64-first-launch-readiness";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    return NextResponse.json(await readV64FirstLaunchReadiness(new URL(request.url).origin), {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "V64 readiness failed." }, { status: 500 });
  }
}
