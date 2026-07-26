import { NextResponse } from "next/server";
import { runV47Reconciliation } from "@/lib/server/v47-reconciler.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(request: Request) {
  const expected = process.env.V47_RECONCILER_SECRET ?? process.env.V47_INDEXER_SECRET;
  if (!expected) return process.env.NODE_ENV !== "production";
  return request.headers.get("authorization") === `Bearer ${expected}`;
}

export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ ok: false, error: "Unauthorized reconciliation request." }, { status: 401 });
  try {
    const body = await request.json().catch(() => ({})) as { maxSubjects?: number };
    const result = await runV47Reconciliation(body);
    return NextResponse.json({ ok: true, result }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "V47 reconciliation failed." }, { status: 400, headers: { "cache-control": "no-store" } });
  }
}
