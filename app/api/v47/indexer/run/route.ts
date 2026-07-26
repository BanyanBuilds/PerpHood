import { NextResponse } from "next/server";
import { runV47IndexerCycle } from "@/lib/server/v47-indexer.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(request: Request) {
  const expected = process.env.V47_INDEXER_SECRET;
  if (!expected) return process.env.NODE_ENV !== "production";
  return request.headers.get("authorization") === `Bearer ${expected}`;
}

export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ ok: false, error: "Unauthorized indexer request." }, { status: 401 });
  try {
    const body = await request.json().catch(() => ({})) as { confirmations?: number; batchSize?: number };
    const result = await runV47IndexerCycle(body);
    return NextResponse.json({ ok: true, result }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "V47 indexing failed." }, { status: 400, headers: { "cache-control": "no-store" } });
  }
}
