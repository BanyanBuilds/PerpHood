import { NextResponse } from "next/server";
import {
  battlePriceEth,
  executeLiquidationCascade,
  positionObligationsWeth,
} from "@/lib/battle-pool.ts";
import {
  DEFAULT_LOCAL_RPC,
  readLocalBattleState,
  rpcRequest,
  waitForReceipt,
} from "@/lib/chain/local-battle-client.ts";
import { loadSequencerState, persistSequencerState, stageSequencerState } from "@/lib/chain/local-sequencer-state.ts";
import { buildEngineStateRoot } from "@/lib/chain/sponsored-quote.ts";
import { assertSingleAccountSettlement, encodeSingleAccountSettlement } from "@/lib/chain/settlement-frame.ts";
import { TradingAction } from "@/lib/chain/trading-actions.ts";
import { keccak256 } from "@/lib/chain/keccak.ts";
import type { Hex } from "@/lib/chain/abi.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_ANVIL_SEQUENCER = "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266" as Hex;

function configuredAddress() {
  const value = process.env.NEXT_PUBLIC_LOCAL_BATTLE_POOL_ADDRESS;
  if (!value || !/^0x[0-9a-fA-F]{40}$/.test(value)) throw new Error("NEXT_PUBLIC_LOCAL_BATTLE_POOL_ADDRESS is not configured.");
  return value.toLowerCase() as Hex;
}

function configuredSequencer() {
  const value = process.env.V23_SEQUENCER_ACCOUNT ?? DEFAULT_ANVIL_SEQUENCER;
  if (!/^0x[0-9a-fA-F]{40}$/.test(value)) throw new Error("V23_SEQUENCER_ACCOUNT is invalid.");
  return value.toLowerCase() as Hex;
}

function toWad(value: number) {
  if (!Number.isFinite(value) || value < 0) throw new Error("Invalid liquidation frame value.");
  return BigInt(Math.floor(value * 1e18 + 1e-6));
}

function openInterest(positions: Array<{ direction: "long" | "short"; notional: number }>, direction: "long" | "short") {
  return positions.reduce((sum, position) => sum + (position.direction === direction ? position.notional : 0), 0);
}

export async function POST(request: Request) {
  const startedAt = performance.now();
  try {
    const configuredSecret = process.env.V23_KEEPER_SECRET;
    if (configuredSecret && request.headers.get("x-perphood-keeper") !== configuredSecret) {
      throw new Error("Keeper authorization failed.");
    }
    const rpcUrl = process.env.LOCAL_CHAIN_RPC ?? process.env.NEXT_PUBLIC_LOCAL_CHAIN_RPC ?? DEFAULT_LOCAL_RPC;
    const contractAddress = configuredAddress();
    const sequencerAccount = configuredSequencer();
    const chain = await readLocalBattleState(rpcUrl, contractAddress);
    const sequencer = await loadSequencerState(contractAddress, chain);
    const cascade = executeLiquidationCascade(sequencer.pool, sequencer.positions);
    if (!cascade.events.length) {
      return NextResponse.json({ ok: true, finalized: false, liquidationCount: 0, message: "No positions are currently liquidatable." });
    }
    if (cascade.totalBadDebtEth > 1e-10) throw new Error("Liquidation batch would realize bad debt and was halted.");

    const intentHash = keccak256(`LEVERAGE X_V23_LIQUIDATION|${chain.sequence + 1}|${chain.stateHash}|${Date.now()}`);
    const positionsRoot = buildEngineStateRoot("positions", cascade.next, cascade.remainingPositions, intentHash);
    const balancesRoot = buildEngineStateRoot("balances", cascade.next, cascade.remainingPositions, intentHash);
    const priceEth = battlePriceEth(cascade.next);
    const settlement = assertSingleAccountSettlement({
      expectedSequence: BigInt(chain.sequence + 1),
      expectedPreviousStateHash: chain.stateHash,
      frame: {
        marketId: chain.marketId,
        action: TradingAction.LiquidationBatch,
        marginalPriceWad: toWad(priceEth),
        marketCapWad: toWad(priceEth * cascade.next.totalSupply),
        reservedWethWad: toWad(positionObligationsWeth(cascade.next)),
        openInterestLongWad: toWad(openInterest(cascade.remainingPositions, "long")),
        openInterestShortWad: toWad(openInterest(cascade.remainingPositions, "short")),
        positionsRoot,
        balancesRoot,
        intentHash,
      },
      account: sequencerAccount,
      accountWethDeltaWad: 0n,
      accountTokenDelta: 0n,
      poolWethDeltaWad: 0n,
      poolTokenDelta: 0n,
    });

    await stageSequencerState({
      contractAddress,
      chainState: chain,
      intentHash,
      positionsRoot,
      balancesRoot,
      pool: cascade.next,
      positions: cascade.remainingPositions,
    });
    const transactionHash = await rpcRequest<Hex>(rpcUrl, "eth_sendTransaction", [{
      from: sequencerAccount,
      to: contractAddress,
      data: encodeSingleAccountSettlement(settlement),
    }]);
    const receipt = await waitForReceipt(transactionHash, rpcUrl);
    if (typeof receipt.status === "string" && receipt.status.toLowerCase() === "0x0") throw new Error("Keeper liquidation settlement reverted.");
    const finalized = await readLocalBattleState(rpcUrl, contractAddress);
    await persistSequencerState({ contractAddress, chainState: finalized, pool: cascade.next, positions: cascade.remainingPositions });

    return NextResponse.json({
      ok: true,
      finalized: true,
      transactionHash,
      sequence: finalized.sequence,
      liquidationCount: cascade.events.length,
      longLiquidations: cascade.longLiquidations,
      shortLiquidations: cascade.shortLiquidations,
      residualEquityEth: cascade.totalResidualEquityEth,
      badDebtEth: cascade.totalBadDebtEth,
      priceBeforeEth: cascade.startPriceEth,
      priceAfterEth: cascade.endPriceEth,
      latencyMs: performance.now() - startedAt,
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Liquidation relay failed." }, {
      status: 400,
      headers: { "cache-control": "no-store" },
    });
  }
}
