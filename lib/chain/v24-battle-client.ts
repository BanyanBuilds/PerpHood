import { decodeBytes32, decodeUint, decodeWords, encodeCall, type Hex } from "./abi.ts";
import { DEFAULT_LOCAL_RPC, ethCall, rpcRequest } from "./local-battle-client.ts";

export type V24ChainState = {
  sequence: number;
  committedAt: number;
  marketId: Hex;
  action: number;
  marginalPriceWad: bigint;
  marketCapWad: bigint;
  poolWethWad: bigint;
  poolTokenAmount: bigint;
  reservedWethWad: bigint;
  curveSoldTokenWad: bigint;
  openInterestLongWad: bigint;
  openInterestShortWad: bigint;
  positionsRoot: Hex;
  balancesRoot: Hex;
  stateHash: Hex;
  availablePoolWethWad: bigint;
  custodySolvent: boolean;
  blockNumber: bigint;
  receivedAt: number;
  rpcLatencyMs: number;
};

export type V24LiquidationContinuation = {
  batchId: Hex;
  startingStateHash: Hex;
  positionsRoot: Hex;
  nextCursor: number;
  totalPositions: number;
  startedAt: number;
  lastProgressAt: number;
  active: boolean;
};

export function decodeV24RuntimeState(runtimeResult: Hex, blockHex: Hex, rpcLatencyMs = 0): V24ChainState {
  const words = decodeWords(runtimeResult);
  if (words.length < 17) throw new Error(`Unexpected V24 runtimeState word count: ${words.length}.`);
  return {
    sequence: Number(decodeUint(words[0])),
    committedAt: Number(decodeUint(words[1])) * 1_000,
    marketId: decodeBytes32(words[2]),
    action: Number(decodeUint(words[3])),
    marginalPriceWad: decodeUint(words[4]),
    marketCapWad: decodeUint(words[5]),
    poolWethWad: decodeUint(words[6]),
    poolTokenAmount: decodeUint(words[7]),
    reservedWethWad: decodeUint(words[8]),
    curveSoldTokenWad: decodeUint(words[9]),
    openInterestLongWad: decodeUint(words[10]),
    openInterestShortWad: decodeUint(words[11]),
    positionsRoot: decodeBytes32(words[12]),
    balancesRoot: decodeBytes32(words[13]),
    stateHash: decodeBytes32(words[14]),
    availablePoolWethWad: decodeUint(words[15]),
    custodySolvent: decodeUint(words[16]) === 1n,
    blockNumber: BigInt(blockHex),
    receivedAt: Date.now(),
    rpcLatencyMs,
  };
}

export async function readV24BattleState(rpcUrl = DEFAULT_LOCAL_RPC, contractAddress?: string): Promise<V24ChainState> {
  if (!contractAddress) throw new Error("NEXT_PUBLIC_V24_BATTLE_POOL_ADDRESS is not configured.");
  const started = performance.now();
  const [runtimeResult, blockHex] = await Promise.all([
    ethCall(rpcUrl, contractAddress, encodeCall("runtimeState()")),
    rpcRequest<Hex>(rpcUrl, "eth_blockNumber"),
  ]);
  return decodeV24RuntimeState(runtimeResult, blockHex, performance.now() - started);
}

export async function readV24LiquidationContinuation(rpcUrl = DEFAULT_LOCAL_RPC, contractAddress?: string): Promise<V24LiquidationContinuation> {
  if (!contractAddress) throw new Error("NEXT_PUBLIC_V24_BATTLE_POOL_ADDRESS is not configured.");
  const result = await ethCall(rpcUrl, contractAddress, encodeCall("liquidationContinuation()"));
  const words = decodeWords(result);
  if (words.length < 8) throw new Error(`Unexpected V24 liquidationContinuation word count: ${words.length}.`);
  return {
    batchId: decodeBytes32(words[0]),
    startingStateHash: decodeBytes32(words[1]),
    positionsRoot: decodeBytes32(words[2]),
    nextCursor: Number(decodeUint(words[3])),
    totalPositions: Number(decodeUint(words[4])),
    startedAt: Number(decodeUint(words[5])) * 1_000,
    lastProgressAt: Number(decodeUint(words[6])) * 1_000,
    active: decodeUint(words[7]) === 1n,
  };
}
