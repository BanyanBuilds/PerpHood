import { NextResponse } from "next/server";
import { isV65LaunchStorageConfigured, listV65Launches, saveV65Launch, type V65LaunchRecordInput } from "@/lib/server/v65-launch-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isV65LaunchStorageConfigured()) return NextResponse.json({ ok: true, configured: false, launches: [] });
  try {
    const limit = Number(new URL(request.url).searchParams.get("limit") ?? 250);
    return NextResponse.json({ ok: true, configured: true, launches: await listV65Launches(limit) });
  } catch (error) {
    return NextResponse.json({ ok: false, configured: true, error: error instanceof Error ? error.message : "V65 launch registry read failed." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!isV65LaunchStorageConfigured()) return NextResponse.json({ ok: false, error: "Supabase launch registry is not configured." }, { status: 503 });
  try {
    return NextResponse.json({ ok: true, launch: await saveV65Launch(await request.json() as V65LaunchRecordInput) }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "V65 launch registry write failed." }, { status: 400 });
  }
}
