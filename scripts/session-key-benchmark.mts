import { performance } from "node:perf_hooks";
import { assertBattlePool, createBattlePoolState } from "../lib/battle-pool.ts";
import type { LocalBattleState } from "../lib/chain/local-battle-client.ts";
import { buildSponsoredSpotBuyQuote } from "../lib/chain/sponsored-quote.ts";
import { encodeAuthorizedSingleAccountSettlement } from "../lib/chain/settlement-frame.ts";
import { bindSessionKey, createSessionKeyMaterial, signTradingIntent, verifySignedTradingIntent } from "../lib/chain/session-key.ts";

function percentile(values: number[], p: number) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
}
function stats(values: number[]) {
  return {
    averageMs: values.reduce((sum, value) => sum + value, 0) / values.length,
    p95Ms: percentile(values, 0.95),
    p99Ms: percentile(values, 0.99),
  };
}

const owner = "0x00000000000000000000000000000000000a11ce" as const;
const marketId = "0x2222222222222222222222222222222222222222222222222222222222222222" as const;
const zero = "0x0000000000000000000000000000000000000000000000000000000000000000" as const;
const material = await createSessionKeyMaterial();
const bound = bindSessionKey(material, owner);
const chainState: LocalBattleState = {
  sequence: 0, committedAt: Date.now(), marketId, action: 0,
  marginalPriceWad: 268_250_000n, marketCapWad: 268_250_000_000_000_000n,
  poolWethWad: 268_250_000_000_000_000n,
  poolTokenAmount: 1_000_000_000n * 10n ** 18n,
  reservedWethWad: 0n, openInterestLongWad: 0n, openInterestShortWad: 0n,
  positionsRoot: zero, balancesRoot: zero,
  stateHash: "0x3333333333333333333333333333333333333333333333333333333333333333",
  availablePoolWethWad: 268_250_000_000_000_000n, custodySolvent: true,
  blockNumber: 1n, receivedAt: Date.now(), rpcLatencyMs: 0,
};

const enginePool = assertBattlePool({
  ...createBattlePoolState(),
  realWethBalance: Number(chainState.poolWethWad) / 1e18,
});

const signTimes: number[] = [];
const verifyTimes: number[] = [];
const quoteTimes: number[] = [];
const iterations = 500;
for (let index = 0; index < iterations; index += 1) {
  const intent = {
    version: 23 as const, sessionId: bound.sessionId, owner, marketId,
    nonce: index, action: 1, notionalWad: "1000000000000000", collateralWad: "1000000000000000", tokenAmountWad: "0", leverageBps: 10_000, positionId: "", reduceFractionBps: 10_000, limitPriceWad: "0",
    maxSlippageBps: 2000, deadline: Math.floor(Date.now() / 1000) + 60,
    clientOrderId: `bench-${index}`,
  };
  let started = performance.now();
  const signed = await signTradingIntent(material, intent);
  signTimes.push(performance.now() - started);
  started = performance.now();
  if (!await verifySignedTradingIntent(signed)) throw new Error("Benchmark signature verification failed.");
  verifyTimes.push(performance.now() - started);
  started = performance.now();
  const quote = buildSponsoredSpotBuyQuote({
    chainState: { ...chainState, sequence: index },
    enginePool,
    positions: [],
    signedIntent: signed,
    sessionNonce: index,
  });
  encodeAuthorizedSingleAccountSettlement(quote.settlement);
  quoteTimes.push(performance.now() - started);
}
console.log(JSON.stringify({
  status: "PASS",
  iterations,
  p256Sign: stats(signTimes),
  p256Verify: stats(verifyTimes),
  quotePlusCalldata: stats(quoteTimes),
}, null, 2));
