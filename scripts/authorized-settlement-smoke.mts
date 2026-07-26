import assert from "node:assert/strict";
import { assertBattlePool, createBattlePoolState } from "../lib/battle-pool.ts";
import type { LocalBattleState } from "../lib/chain/local-battle-client.ts";
import { buildSponsoredSpotBuyQuote } from "../lib/chain/sponsored-quote.ts";
import { encodeAuthorizedSingleAccountSettlement } from "../lib/chain/settlement-frame.ts";
import { bindSessionKey, createSessionKeyMaterial, signTradingIntent } from "../lib/chain/session-key.ts";

const ETH = 10n ** 18n;
const TOKEN = 10n ** 18n;
const owner = "0x00000000000000000000000000000000000a11ce" as const;
const marketId = "0x2222222222222222222222222222222222222222222222222222222222222222" as const;
const zero = "0x0000000000000000000000000000000000000000000000000000000000000000" as const;
const chainState: LocalBattleState = {
  sequence: 7,
  committedAt: Date.now(),
  marketId,
  action: 0,
  marginalPriceWad: 268_250_000n,
  marketCapWad: 268_250_000_000_000_000n,
  poolWethWad: 268_250_000_000_000_000n,
  poolTokenAmount: 1_000_000_000n * TOKEN,
  reservedWethWad: 0n,
  openInterestLongWad: 0n,
  openInterestShortWad: 0n,
  positionsRoot: zero,
  balancesRoot: zero,
  stateHash: "0x3333333333333333333333333333333333333333333333333333333333333333",
  availablePoolWethWad: 268_250_000_000_000_000n,
  custodySolvent: true,
  blockNumber: 3n,
  receivedAt: Date.now(),
  rpcLatencyMs: 0.2,
};
const material = await createSessionKeyMaterial();
const bound = bindSessionKey(material, owner);
const signed = await signTradingIntent(material, {
  version: 23,
  sessionId: bound.sessionId,
  owner,
  marketId,
  nonce: 0,
  action: 1,
  notionalWad: (1_000_000_000_000_000n).toString(),
  collateralWad: (1_000_000_000_000_000n).toString(), tokenAmountWad: "0", leverageBps: 10_000, positionId: "", reduceFractionBps: 10_000,
  limitPriceWad: "0",
  maxSlippageBps: 2_000,
  deadline: Math.floor(Date.now() / 1000) + 30,
  clientOrderId: "quote-smoke",
});
const enginePool = assertBattlePool({
  ...createBattlePoolState(),
  realWethBalance: Number(chainState.poolWethWad) / 1e18,
});
const quote = buildSponsoredSpotBuyQuote({
  chainState,
  enginePool,
  positions: [],
  signedIntent: signed,
  sessionNonce: 0,
});
assert.equal(quote.grossWethWad, 1_000_000_000_000_000n);
assert(quote.feeWad >= 2_999_999_999_000n && quote.feeWad <= 3_000_000_001_000n);
assert.equal(quote.settlement.accountWethDeltaWad + quote.settlement.poolWethDeltaWad, 0n);
assert.equal(quote.settlement.accountTokenDelta + quote.settlement.poolTokenDelta, 0n);
assert(quote.tokenAmountWad > 0n);
assert(quote.priceAfterWad > quote.priceBeforeWad);
assert(quote.executionSteps >= 1);
assert.equal(quote.liquidationCount, 0);
const calldata = encodeAuthorizedSingleAccountSettlement(quote.settlement);
assert.match(calldata, /^0x[0-9a-f]+$/);
assert.equal(calldata.length, 2 + 8 + 21 * 64);
console.log("V23 sponsored spot-buy quote and authorized settlement encoding passed.");
