import { NextResponse } from "next/server";
import { rollbackV47ToBlock } from "@/lib/server/v47-indexer.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(request: Request) {
  const expected = process.env.V47_RECOVERY_SECRET ?? process.env.V47_INDEXER_SECRET;
  if (!expected) return process.env.NODE_ENV !== "production";
  return request.headers.get("authorization") === `Bearer ${expected}`;
}

export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ ok: false, error: "Unauthorized recovery request." }, { status: 401 });
  try {
    const body = await request.json() as { chainId?: number; ancestorBlock?: number };
    if (!Number.isInteger(body.chainId) || Number(body.chainId) <= 0) throw new Error("A valid chain ID is required.");
    if (!Number.isInteger(body.ancestorBlock) || Number(body.ancestorBlock) < 0) throw new Error("A valid ancestor block is required.");
    const result = rollbackV47ToBlock(Number(body.chainId), Number(body.ancestorBlock));
    return NextResponse.json({ ok: true, result, warning: "Projections were rebuilt from canonical raw events. Run the indexer to replay forward." }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "V47 rollback failed." }, { status: 400, headers: { "cache-control": "no-store" } });
  }
}
