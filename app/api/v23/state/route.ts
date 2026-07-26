import { NextResponse } from "next/server";
import { DEFAULT_LOCAL_RPC, readLocalBattleState } from "@/lib/chain/local-battle-client.ts";
import { loadSequencerState } from "@/lib/chain/local-sequencer-state.ts";
import { battlePriceEth, freeWeth, positionObligationsWeth, shortInventoryUtilization } from "@/lib/battle-pool.ts";
import type { Hex } from "@/lib/chain/abi.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function configuredAddress() {
  const value = process.env.NEXT_PUBLIC_LOCAL_BATTLE_POOL_ADDRESS;
  if (!value || !/^0x[0-9a-fA-F]{40}$/.test(value)) throw new Error("NEXT_PUBLIC_LOCAL_BATTLE_POOL_ADDRESS is not configured.");
  return value.toLowerCase() as Hex;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const owner = url.searchParams.get("owner")?.toLowerCase();
    const rpcUrl = process.env.LOCAL_CHAIN_RPC ?? process.env.NEXT_PUBLIC_LOCAL_CHAIN_RPC ?? DEFAULT_LOCAL_RPC;
    const contractAddress = configuredAddress();
    const chain = await readLocalBattleState(rpcUrl, contractAddress);
    const state = await loadSequencerState(contractAddress, chain);
    const positions = owner
      ? state.positions.filter((position) => !position.owner || position.owner.toLowerCase() === owner)
      : state.positions;
    return NextResponse.json({
      ok: true,
      chain: {
        sequence: chain.sequence,
        stateHash: chain.stateHash,
        marketId: chain.marketId,
        custodySolvent: chain.custodySolvent,
      },
      engine: {
        priceEth: battlePriceEth(state.pool),
        marketCapEth: battlePriceEth(state.pool) * state.pool.totalSupply,
        realWethBalance: state.pool.realWethBalance,
        freeWeth: freeWeth(state.pool),
        reservedPositionEquity: positionObligationsWeth(state.pool),
        poolFeesEth: state.pool.poolFeesEth,
        liquidationEquityEth: state.pool.liquidationEquityEth,
        badDebtEth: state.pool.badDebtEth,
        shortInventoryUtilization: shortInventoryUtilization(state.pool),
      },
      positions,
      allPositionCount: state.positions.length,
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "State read failed." }, {
      status: 400,
      headers: { "cache-control": "no-store" },
    });
  }
}
