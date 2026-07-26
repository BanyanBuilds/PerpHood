import { NextResponse } from "next/server";
import { v46OrderStoreStats } from "@/lib/server/v47-order-store.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const stats = await v46OrderStoreStats();
    return NextResponse.json({
      ok: true,
      version: 46,
      mode: "durable-local-order-store",
      orderStore: stats,
      keeperSecretConfigured: Boolean(process.env.V46_KEEPER_SECRET),
      keeperAccountsConfigured: Boolean(process.env.V46_KEEPER_ACCOUNTS || process.env.V45_SEQUENCER_ACCOUNT),
      rpcUrl: process.env.LOCAL_CHAIN_RPC ?? process.env.NEXT_PUBLIC_LOCAL_CHAIN_RPC ?? "http://127.0.0.1:8545",
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "V46 keeper status failed." }, { status: 500 });
  }
}
