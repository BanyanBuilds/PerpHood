import { NextResponse } from "next/server";
import { verifyV46SignedCancellation, type V46SignedCancellation } from "@/lib/chain/v46-order.ts";
import { cancelV46Order, getV46Order } from "@/lib/server/v47-order-store.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { signedCancellation?: V46SignedCancellation };
    const signed = body.signedCancellation;
    if (!signed || !await verifyV46SignedCancellation(signed)) throw new Error("Invalid V46 cancellation signature.");
    const now = Math.floor(Date.now() / 1_000);
    if (signed.intent.deadline < now) throw new Error("V46 cancellation signature expired.");
    const existing = await getV46Order(signed.intent.orderId);
    if (!existing) throw new Error("V46 order was not found.");
    if (existing.intent.owner.toLowerCase() !== signed.intent.owner.toLowerCase()) throw new Error("Cancellation owner mismatch.");
    if (existing.intent.sessionId.toLowerCase() !== signed.intent.sessionId.toLowerCase()) throw new Error("Cancellation session mismatch.");
    if (existing.publicKeyHash.toLowerCase() !== signed.publicKeyHash.toLowerCase()) throw new Error("Cancellation public-key mismatch.");
    const order = await cancelV46Order(signed.intent.orderId, signed.intent.owner);
    return NextResponse.json({ ok: true, order }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "V46 order cancellation failed." }, { status: 400, headers: { "cache-control": "no-store" } });
  }
}
