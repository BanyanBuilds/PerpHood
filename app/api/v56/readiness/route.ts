import { NextResponse } from "next/server";
import { LEVERAGEX_RELEASE_STAGE, LEVERAGEX_RELEASE_STATUS, PERPS_PUBLICLY_ENABLED } from "@/lib/v56-release-state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FACTORY = process.env.NEXT_PUBLIC_V56_MAINNET_FACTORY_ADDRESS ?? "";
const validFactory = /^0x[0-9a-fA-F]{40}$/.test(FACTORY);

export async function GET() {
  const release = LEVERAGEX_RELEASE_STATUS[LEVERAGEX_RELEASE_STAGE];
  return NextResponse.json({
    ok: true,
    product: "leverage X",
    version: "V56",
    chain: {
      name: "Robinhood Chain Mainnet",
      chainId: 4663,
      explorer: "https://robinhoodchain.blockscout.com",
    },
    release: {
      stage: LEVERAGEX_RELEASE_STAGE,
      label: release.label,
      detail: release.detail,
    },
    contracts: {
      factoryConfigured: validFactory,
      factoryAddress: validFactory ? FACTORY.toLowerCase() : null,
    },
    features: {
      spot: LEVERAGEX_RELEASE_STAGE === "canary" || LEVERAGEX_RELEASE_STAGE === "spot-live",
      publicLaunches: LEVERAGEX_RELEASE_STAGE === "spot-live",
      perps: PERPS_PUBLICLY_ENABLED,
    },
    truth: "This endpoint reports configured release state only. Explorer receipts and contract reads remain authoritative.",
  }, { headers: { "cache-control": "no-store" } });
}
