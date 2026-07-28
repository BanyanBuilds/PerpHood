import { NextRequest, NextResponse } from "next/server";
import { publishV85LiveEvent } from "@/lib/server/v85-live-event-hub";
import { materializeV87LiveEvents } from "@/lib/server/v87-live-state-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(request: NextRequest) {
  const expected = process.env.LIVE_EVENT_INGEST_SECRET?.trim();
  if (!expected) return false;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  return supplied === expected;
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  try {
    const payload = await request.json();
    const inputs = Array.isArray(payload) ? payload : [payload];
    if (inputs.length > 250) return NextResponse.json({ ok: false, error: "Maximum batch size is 250 events." }, { status: 413 });
    const materialized = materializeV87LiveEvents(inputs);
    const events = materialized.events.map(publishV85LiveEvent);
    return NextResponse.json({ ok: true, accepted: events.length, applied: materialized.applied, duplicates: materialized.duplicates, cursor: events.at(-1)?.id ?? null }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Invalid live event." }, { status: 400 });
  }
}
