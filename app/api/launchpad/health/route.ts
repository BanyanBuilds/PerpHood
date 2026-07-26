import { NextResponse } from "next/server";
import { LAUNCHPAD_VERSION } from "@/lib/launchpad";

export const dynamic = "force-dynamic";

export async function GET() {
  const rpcUrl = process.env.LOCAL_CHAIN_RPC ?? process.env.NEXT_PUBLIC_LOCAL_CHAIN_RPC ?? "http://127.0.0.1:8545";
  const accountRouterAddress = process.env.V45_ACCOUNT_ROUTER_ADDRESS ?? process.env.NEXT_PUBLIC_V45_ACCOUNT_ROUTER_ADDRESS ?? null;
  const factoryAddress = process.env.V45_LAUNCHPAD_FACTORY_ADDRESS ?? process.env.NEXT_PUBLIC_V45_LAUNCHPAD_FACTORY_ADDRESS ?? accountRouterAddress ?? process.env.V43_LAUNCHPAD_FACTORY_ADDRESS ?? process.env.NEXT_PUBLIC_V43_LAUNCHPAD_FACTORY_ADDRESS ?? null;
  try {
    const response = await fetch(rpcUrl, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 45, method: "eth_chainId", params: [] }),
      cache: "no-store", signal: AbortSignal.timeout(1_500),
    });
    const payload = await response.json() as { result?: string; error?: { message: string } };
    if (!response.ok || payload.error || !payload.result) throw new Error(payload.error?.message ?? `RPC HTTP ${response.status}`);
    const chainId = Number(BigInt(payload.result));
    return NextResponse.json({
      ok: chainId === 31_337,
      version: LAUNCHPAD_VERSION,
      executionVersion: "v46-order-keeper-network",
      mode: factoryAddress ? "local-chain" : "hybrid-local-test",
      chainConnected: true, chainId,
      factoryDeployed: Boolean(factoryAddress), factoryAddress, accountRouterAddress,
      executableSpotCurve: true, fullPerpsSettlement: true, terminalContractExecution: true,
      internalAccountLedger: true, p256SessionIntents: true, sponsoredSequencerExecution: true,
      directWithdrawEscapePath: true, durableSignedOrders: true, conditionalKeeperExecution: true, batchLiquidationKeeper: true, migrationCoordinatorDeployed: false, indexerConnected: false,
      message: accountRouterAddress
        ? "V46 execution is configured: V45 custody and bounded sessions plus durable signed orders, conditional keeper fills, and batch liquidations."
        : factoryAddress
          ? "The unified market is configured without the V45 account router. Run npm run chain:v45 for authorize-once execution."
          : "Anvil is online. Run npm run chain:v45 and configure the printed V45 addresses.",
    });
  } catch (error) {
    return NextResponse.json({
      ok: false, version: LAUNCHPAD_VERSION, executionVersion: "v46-order-keeper-network", mode: "hybrid-local-test",
      chainConnected: false, factoryDeployed: Boolean(factoryAddress), factoryAddress, accountRouterAddress,
      executableSpotCurve: true, fullPerpsSettlement: true, terminalContractExecution: true,
      internalAccountLedger: true, p256SessionIntents: true, sponsoredSequencerExecution: true,
      migrationCoordinatorDeployed: false, indexerConnected: false,
      message: error instanceof Error ? error.message : "Local RPC is unavailable.",
    });
  }
}
