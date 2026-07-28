import { NextResponse } from "next/server";
import { readV64FirstLaunchReadiness } from "@/lib/server/v64-first-launch-readiness";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const state = await readV64FirstLaunchReadiness(new URL(request.url).origin);
    return NextResponse.json({
      schema: "https://leveragex.fun/schemas/gmgn-canary-evidence-v1.json",
      product: state.product,
      version: state.version,
      checkedAt: state.checkedAt,
      chain: state.chain,
      launchpad: state.launchpad,
      factory: state.factory,
      token: state.firstLaunch,
      transactions: state.transactions,
      proof: {
        sourceVerified: state.gates.sourceVerified,
        canaryLaunchConfirmed: state.gates.canaryLaunchConfirmed,
        productionRegistryReady: state.gates.productionRegistryReady,
        cappedSpotOpen: state.gates.cappedSpotOpen,
        externalRoundtripConfirmed: state.gates.roundtripConfirmed,
        evidenceReady: state.gates.gmgnEvidenceReady,
      },
      disclaimer: "The official GMGN launchpad label is granted by GMGN and is never self-asserted by Leverage X.",
    }, {
      headers: { "access-control-allow-origin": "*", "cache-control": "public, max-age=15, s-maxage=60" },
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "V64 GMGN evidence failed." }, { status: 500 });
  }
}
