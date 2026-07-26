import { NextResponse } from "next/server";
import { v47IndexedSnapshot } from "@/lib/server/v47-indexer.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function address(value: string | null) {
  if (!value) return undefined;
  if (!/^0x[0-9a-fA-F]{40}$/.test(value)) throw new Error("Address filter is invalid.");
  return value.toLowerCase();
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const snapshot = v47IndexedSnapshot({ owner: address(url.searchParams.get("owner")), market: address(url.searchParams.get("market")) });
    return NextResponse.json({ ok: true, version: 47, snapshot }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "V47 snapshot failed." }, { status: 400, headers: { "cache-control": "no-store" } });
  }
}
