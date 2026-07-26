import assert from "node:assert/strict";
import { assertBattlePool, createBattlePoolState, battlePriceEth } from "../lib/battle-pool.ts";
import type { LocalBattleState } from "../lib/chain/local-battle-client.ts";
import { buildSponsoredTradeQuote } from "../lib/chain/sponsored-quote.ts";
import { bindSessionKey, createSessionKeyMaterial, signTradingIntent } from "../lib/chain/session-key.ts";
import { TradingAction } from "../lib/chain/trading-actions.ts";
import { keccak256 } from "../lib/chain/keccak.ts";
import type { Position } from "../lib/types.ts";

const ETH = 10n ** 18n;
const TOKEN = 10n ** 18n;
const owner = "0x00000000000000000000000000000000000a11ce" as const;
const marketId = "0x2323232323232323232323232323232323232323232323232323232323232323" as const;
const zero = "0x0000000000000000000000000000000000000000000000000000000000000000" as const;
let chain: LocalBattleState = {
  sequence: 0,
  committedAt: Date.now(),
  marketId,
  action: 0,
  marginalPriceWad: 250_000_000n,
  marketCapWad: 250_000_000_000_000_000n,
  poolWethWad: 2n * ETH,
  poolTokenAmount: 1_000_000_000n * TOKEN,
  reservedWethWad: 0n,
  openInterestLongWad: 0n,
  openInterestShortWad: 0n,
  positionsRoot: zero,
  balancesRoot: zero,
  stateHash: keccak256("v23-genesis"),
  availablePoolWethWad: 2n * ETH,
  custodySolvent: true,
  blockNumber: 1n,
  receivedAt: Date.now(),
  rpcLatencyMs: 0.1,
};
let pool = assertBattlePool({ ...createBattlePoolState(), realWethBalance: 2 });
let positions: Position[] = [];
const material = await createSessionKeyMaterial();
const bound = bindSessionKey(material, owner);
let nonce = 0;

async function execute(input: {
  action: number;
  notionalWad: bigint;
  collateralWad?: bigint;
  tokenAmountWad?: bigint;
  leverageBps?: number;
  positionId?: string;
  reduceFractionBps?: number;
}) {
  const signed = await signTradingIntent(material, {
    version: 23,
    sessionId: bound.sessionId,
    owner,
    marketId,
    nonce,
    action: input.action,
    notionalWad: input.notionalWad.toString(),
    collateralWad: (input.collateralWad ?? 0n).toString(),
    tokenAmountWad: (input.tokenAmountWad ?? 0n).toString(),
    leverageBps: input.leverageBps ?? 10_000,
    positionId: input.positionId ?? "",
    reduceFractionBps: input.reduceFractionBps ?? 10_000,
    limitPriceWad: "0",
    maxSlippageBps: 1_000_000,
    deadline: Math.floor(Date.now() / 1_000) + 60,
    clientOrderId: `v23-smoke-${nonce}`,
  });
  const quote = buildSponsoredTradeQuote({ chainState: chain, enginePool: pool, positions, signedIntent: signed, sessionNonce: nonce });
  assert.equal(quote.settlement.accountWethDeltaWad + quote.settlement.poolWethDeltaWad, 0n);
  assert.equal(quote.settlement.accountTokenDelta + quote.settlement.poolTokenDelta, 0n);
  assert.equal(quote.nextPool.badDebtEth, 0);
  pool = quote.nextPool;
  positions = quote.remainingPositions;
  chain = {
    ...chain,
    sequence: chain.sequence + 1,
    action: input.action,
    poolWethWad: chain.poolWethWad + quote.settlement.poolWethDeltaWad,
    poolTokenAmount: chain.poolTokenAmount + quote.settlement.poolTokenDelta,
    reservedWethWad: quote.settlement.frame.reservedWethWad,
    openInterestLongWad: quote.settlement.frame.openInterestLongWad,
    openInterestShortWad: quote.settlement.frame.openInterestShortWad,
    marginalPriceWad: quote.priceAfterWad,
    marketCapWad: quote.marketCapAfterWad,
    positionsRoot: quote.settlement.frame.positionsRoot,
    balancesRoot: quote.settlement.frame.balancesRoot,
    stateHash: keccak256(`frame-${nonce}-${signed.intentHash}`),
    availablePoolWethWad: chain.poolWethWad + quote.settlement.poolWethDeltaWad - quote.settlement.frame.reservedWethWad,
  };
  nonce += 1;
  return quote;
}

const buy = await execute({ action: TradingAction.SpotBuy, notionalWad: 10_000_000_000_000_000n });
assert(buy.tokenAmountWad > 0n);
const sellTokens = buy.tokenAmountWad / 3n;
const sellNotional = BigInt(Math.max(1, Math.floor(Number(sellTokens) / 1e18 * battlePriceEth(pool) * 1e18)));
const sell = await execute({ action: TradingAction.SpotSell, notionalWad: sellNotional, tokenAmountWad: sellTokens });
assert(sell.netWethWad > 0n);

const long = await execute({
  action: TradingAction.OpenLong,
  notionalWad: 20_000_000_000_000_000n,
  collateralWad: 5_000_000_000_000_000n,
  leverageBps: 40_000,
});
assert(long.position?.direction === "long");
let longPosition = positions.find((position) => position.direction === "long")!;
const closeLongHalf = await execute({
  action: TradingAction.CloseLong,
  notionalWad: BigInt(Math.floor(longPosition.notional * 0.5 * 1e18)),
  positionId: longPosition.id,
  reduceFractionBps: 5_000,
  leverageBps: Math.round(longPosition.leverage * 10_000),
});
assert.equal(closeLongHalf.closedPositionId, longPosition.id);
assert(positions.some((position) => position.id === longPosition.id));
longPosition = positions.find((position) => position.id === longPosition.id)!;
await execute({
  action: TradingAction.CloseLong,
  notionalWad: BigInt(Math.floor(longPosition.notional * 1e18)),
  positionId: longPosition.id,
  reduceFractionBps: 10_000,
  leverageBps: Math.round(longPosition.leverage * 10_000),
});
assert(!positions.some((position) => position.id === longPosition.id));

const short = await execute({
  action: TradingAction.OpenShort,
  notionalWad: 6_000_000_000_000_000n,
  collateralWad: 2_000_000_000_000_000n,
  leverageBps: 30_000,
});
assert(short.position?.direction === "short");
const shortPosition = positions.find((position) => position.direction === "short")!;
const closeShort = await execute({
  action: TradingAction.CloseShort,
  notionalWad: BigInt(Math.floor(shortPosition.notional * 1e18)),
  positionId: shortPosition.id,
  reduceFractionBps: 10_000,
  leverageBps: Math.round(shortPosition.leverage * 10_000),
});
assert.equal(closeShort.closedPositionId, shortPosition.id);
assert(!positions.some((position) => position.id === shortPosition.id));
assert.equal(pool.badDebtEth, 0);
assert((chain.poolWethWad - BigInt(Math.floor(pool.realWethBalance * 1e18))) ** 2n < 1_000_000_000_000n);
console.log(`V23 full action pipeline passed ${nonce} ordered actions with ${positions.length} remaining position and zero bad debt.`);
