import { NextRequest, NextResponse } from "next/server";
import { deployLaunchContracts, deploymentReadiness, verifyDeployment } from "@/lib/v81-deployment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(request: NextRequest): boolean {
  const expected = process.env.LEVERAGEX_DEPLOY_ADMIN_TOKEN?.trim();
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  return Boolean(expected && supplied && expected.length >= 32 && supplied === expected);
}
export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const url = new URL(request.url);
    const locker = url.searchParams.get("locker") || undefined;
    const factory = url.searchParams.get("factory") || undefined;
    const data = locker || factory ? await verifyDeployment(locker, factory) : await deploymentReadiness();
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Request failed" }, { status: 500 }); }
}
export async function POST(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (request.headers.get("x-leveragex-confirm") !== "DEPLOY-RH-4663") return NextResponse.json({ error: "Missing deployment confirmation." }, { status: 400 });
  try {
    const configuredLocker = process.env.LEVERAGEX_LIQUIDITY_LOCKER_ADDRESS?.trim();
    const configuredFactory = process.env.LEVERAGEX_LAUNCH_FACTORY_ADDRESS?.trim();
    if (configuredLocker || configuredFactory) {
      try { return NextResponse.json({ error: "A deployment is already configured. Duplicate deployment refused.", current: await verifyDeployment(configuredLocker, configuredFactory) }, { status: 409 }); }
      catch { return NextResponse.json({ error: "Deployment address variables exist but fail verification. Clear or correct them before deploying." }, { status: 409 }); }
    }
    return NextResponse.json(await deployLaunchContracts(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Deployment failed" }, { status: 500 }); }
}
