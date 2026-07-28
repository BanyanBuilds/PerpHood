import { NextResponse } from "next/server";
import { createV54Metadata, isV54LaunchStorageConfigured } from "@/lib/server/v54-launch-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isV54LaunchStorageConfigured()) {
    return NextResponse.json({ error: "Leverage X token-media storage is not configured." }, { status: 503 });
  }
  try {
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (Number.isFinite(contentLength) && contentLength > 4.5 * 1024 * 1024) throw new Error("Metadata upload request exceeds 4.5 MB.");
    const result = await createV54Metadata(await request.formData());
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Metadata upload failed." }, { status: 400 });
  }
}
