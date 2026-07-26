import { NextResponse } from "next/server";
import { configuredV45RouterAddress, readV45SessionState } from "@/lib/chain/v45-account-client.ts";
import { verifyV46SignedOrder, type V46SignedOrder } from "@/lib/chain/v46-order.ts";
import { createV46Order, listV46Orders } from "@/lib/server/v47-order-store.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function validAddress(value?: string) {
  return Boolean(value && /^0x[0-9a-fA-F]{40}$/.test(value));
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const owner = url.searchParams.get("owner") ?? undefined;
    const market = url.searchParams.get("market") ?? undefined;
    if (owner && !validAddress(owner)) throw new Error("Owner filter is invalid.");
    if (market && !validAddress(market)) throw new Error("Market filter is invalid.");
    const orders = await listV46Orders({ owner, market });
    return NextResponse.json({ ok: true, orders }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "V46 order lookup failed." }, { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { signedOrder?: V46SignedOrder };
    const signed = body.signedOrder;
    if (!signed || !await verifyV46SignedOrder(signed)) throw new Error("Invalid V46 durable-order signature.");
    const router = configuredV45RouterAddress();
    if (!router || router.toLowerCase() !== signed.intent.router.toLowerCase()) throw new Error("V46 order router does not match this deployment.");
    const session = await readV45SessionState(signed.intent.sessionId, router);
    const now = Math.floor(Date.now() / 1_000);
    if (!session.active || session.validUntil <= now) throw new Error("V46 orders require an active V45 session.");
    if (session.owner.toLowerCase() !== signed.intent.owner.toLowerCase()) throw new Error("V46 order owner does not match the authorized session.");
    if (session.publicKeyHash.toLowerCase() !== signed.publicKeyHash.toLowerCase()) throw new Error("V46 order key does not match the authorized session.");
    if (signed.intent.expiresAt > session.validUntil) throw new Error("V46 order cannot outlive the authorized session.");
    if ((session.actionBitmap & (1n << BigInt(signed.intent.action))) === 0n) throw new Error("V46 order action is outside the session scope.");
    const order = await createV46Order(signed);
    return NextResponse.json({ ok: true, order }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "V46 order creation failed." }, { status: 400, headers: { "cache-control": "no-store" } });
  }
}
