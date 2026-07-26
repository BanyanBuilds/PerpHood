import { NextResponse } from "next/server";
import {
  LAUNCHPAD_DEFAULT_GAS_RESERVE_ETH,
  LAUNCHPAD_MIN_TOTAL_SPEND_ETH,
  LAUNCHPAD_TARGET_MARKET_CAP_USD,
  LAUNCHPAD_TARGET_OPTIONS_USD,
  LAUNCHPAD_VERSION,
  estimateMigrationTarget,
} from "@/lib/launchpad";

export async function GET() {
  const accountRouterAddress = process.env.NEXT_PUBLIC_V45_ACCOUNT_ROUTER_ADDRESS ?? null;
  const factoryAddress = process.env.NEXT_PUBLIC_V45_LAUNCHPAD_FACTORY_ADDRESS ?? accountRouterAddress ?? process.env.NEXT_PUBLIC_V43_LAUNCHPAD_FACTORY_ADDRESS ?? null;
  return NextResponse.json({
    mode: factoryAddress ? "local-chain" : "local-test",
    version: LAUNCHPAD_VERSION,
    executionVersion: "v46-order-keeper-network",
    minimumTotalSpendEth: LAUNCHPAD_MIN_TOTAL_SPEND_ETH,
    defaultGasReserveEth: LAUNCHPAD_DEFAULT_GAS_RESERVE_ETH,
    targetMarketCapUsd: LAUNCHPAD_TARGET_MARKET_CAP_USD,
    targetOptionsUsd: LAUNCHPAD_TARGET_OPTIONS_USD,
    defaultTargetEstimate: estimateMigrationTarget(),
    deploysRealContracts: Boolean(factoryAddress),
    factoryAddress,
    accountRouterAddress,
    executableSpotCurve: true,
    fullPerpsSettlement: true,
    terminalContractExecution: true,
    internalAccountLedger: true,
    p256SessionIntents: true,
    sponsoredSequencerExecution: true,
    directWithdrawEscapePath: true,
    durableSignedOrders: true,
    conditionalKeeperExecution: true,
    batchLiquidationKeeper: true,
  });
}
