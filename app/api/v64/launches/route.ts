import { NextResponse } from "next/server";
import { isV54LaunchStorageConfigured, listV54Launches, saveV54Launch, type V54LaunchRecordInput } from "@/lib/server/v54-launch-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isV54LaunchStorageConfigured()) return NextResponse.json({ ok: true, configured: false, launches: [] });
  try {
    const limit = Number(new URL(request.url).searchParams.get("limit") ?? 100);
    return NextResponse.json({ ok: true, configured: true, launches: await listV54Launches(limit) });
  } catch (error) {
    return NextResponse.json({ ok: false, configured: true, error: error instanceof Error ? error.message : "Launch registry read failed." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!isV54LaunchStorageConfigured()) return NextResponse.json({ ok: false, error: "Supabase launch registry is not configured." }, { status: 503 });
  try {
    return NextResponse.json({ ok: true, launch: await saveV54Launch(await request.json() as V54LaunchRecordInput) }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Launch registry write failed." }, { status: 400 });
  }
}
