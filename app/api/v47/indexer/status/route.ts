import { NextResponse } from "next/server";
import { listV47Heartbeats, v47DatabaseStats } from "@/lib/server/v47-database.ts";
import { v47IndexedSnapshot } from "@/lib/server/v47-indexer.ts";
import { recentV47Reconciliation } from "@/lib/server/v47-reconciler.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({
      ok: true,
      version: 47,
      mode: "sqlite-reorg-safe-indexer",
      database: v47DatabaseStats(),
      snapshot: v47IndexedSnapshot(),
      heartbeats: listV47Heartbeats(),
      reconciliation: recentV47Reconciliation(),
      rpcUrl: process.env.LOCAL_CHAIN_RPC ?? process.env.NEXT_PUBLIC_LOCAL_CHAIN_RPC ?? "http://127.0.0.1:8545",
      confirmations: Number(process.env.V47_FINALITY_CONFIRMATIONS ?? 0),
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "V47 status failed." }, { status: 500, headers: { "cache-control": "no-store" } });
  }
}
