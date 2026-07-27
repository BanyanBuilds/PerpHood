import { NextResponse } from "next/server";
import {
  isV53SupabaseConfigured,
  parseV53RecoveryKey,
  readV53RemoteState,
  saveV53RemoteState,
} from "@/lib/server/v53-user-state-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEVICE_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_REQUEST_BYTES = 300 * 1024;

function notConfigured() {
  return NextResponse.json({ configured: false, error: "Supabase user-state sync is not configured." }, { status: 503 });
}

export async function GET(request: Request) {
  if (!isV53SupabaseConfigured()) return notConfigured();
  try {
    const recoveryKey = parseV53RecoveryKey(request);
    const state = await readV53RemoteState(recoveryKey, {
      id: DEVICE_ID_PATTERN.test(request.headers.get("x-perphood-device-id") ?? "") ? request.headers.get("x-perphood-device-id") ?? undefined : undefined,
      label: request.headers.get("x-perphood-device-label") ?? undefined,
      userAgent: request.headers.get("user-agent"),
    });
    return NextResponse.json({ configured: true, ...state });
  } catch (error) {
    return NextResponse.json({ configured: true, error: error instanceof Error ? error.message : "User-state read failed." }, { status: 400 });
  }
}

export async function PUT(request: Request) {
  if (!isV53SupabaseConfigured()) return notConfigured();
  try {
    const recoveryKey = parseV53RecoveryKey(request);
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) throw new Error("User-state request is too large.");
    const body = await request.json() as { expectedRevision?: number; state?: unknown; deviceId?: string; deviceLabel?: string };
    if (!body.deviceId || !DEVICE_ID_PATTERN.test(body.deviceId)) throw new Error("A valid device ID is required.");
    const result = await saveV53RemoteState({
      recoveryKey,
      expectedRevision: Number(body.expectedRevision ?? 0),
      state: body.state,
      deviceId: body.deviceId,
      deviceLabel: body.deviceLabel,
      userAgent: request.headers.get("user-agent"),
    });
    return NextResponse.json(result, { status: result.conflict ? 409 : 200 });
  } catch (error) {
    return NextResponse.json({ configured: true, error: error instanceof Error ? error.message : "User-state save failed." }, { status: 400 });
  }
}
