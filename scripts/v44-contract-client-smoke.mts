import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { encodeUint } from "../lib/chain/abi.ts";
import { eventTopic } from "../lib/chain/keccak.ts";
import {
  V43_POSITION_CLOSED_EVENT,
  V43_POSITION_OPENED_EVENT,
  V43_TRADE_EVENT,
  parseV44PositionClosedEvent,
  parseV44PositionOpenedEvent,
  parseV44TradeEvent,
  runtimeStateToTokenPatch,
} from "../lib/chain/v44-market-client.ts";

type Hex = `0x${string}`;
const topicAddress = (value: string) => `0x${value.slice(2).padStart(64, "0")}` as Hex;
const topicUint = (value: bigint | number) => `0x${BigInt(value).toString(16).padStart(64, "0")}` as Hex;
const dataWords = (...values: bigint[]) => `0x${values.map((value) => encodeUint(value)).join("")}` as Hex;
const trader = "0x1111111111111111111111111111111111111111";

const trade = parseV44TradeEvent({ logs: [{ address: trader as Hex, topics: [eventTopic(V43_TRADE_EVENT), topicAddress(trader), topicUint(1)], data: dataWords(2n, 3n, 4n, 5n, 6n) }] });
assert.equal(trade?.trader.toLowerCase(), trader);
assert.equal(trade?.isBuy, true);
assert.equal(trade?.marketCapEthWad, 6n);

const opened = parseV44PositionOpenedEvent({ logs: [{ address: trader as Hex, topics: [eventTopic(V43_POSITION_OPENED_EVENT), topicUint(7), topicAddress(trader), topicUint(1)], data: dataWords(20n, 1_000n, 20_000n, 50_000n, 60_000n, 70_000n) }] });
assert.equal(opened?.positionId, 7n);
assert.equal(opened?.direction, "short");
assert.equal(opened?.leverage, 20);

const negativeFive = (1n << 256n) - 5n;
const closed = parseV44PositionClosedEvent({ logs: [{ address: trader as Hex, topics: [eventTopic(V43_POSITION_CLOSED_EVENT), topicUint(7), topicAddress(trader), topicUint(0)], data: dataWords(0n, 995n, negativeFive, 2n, 0n) }] });
assert.equal(closed?.direction, "long");
assert.equal(closed?.pnlWei, -5n);
assert.equal(closed?.badDebtWei, 0n);

const one = 10n ** 18n;
const patch = runtimeStateToTokenPatch({
  sequence: 44,
  timestamp: Date.now(),
  phase: 0,
  marginalPriceWad: one / 1_000_000n,
  marketCapEthWad: 1_000n * one,
  realWethBalanceWei: 12n * one,
  freeWethWei: 7n * one,
  curveSoldTokenWad: 10n * one,
  curveTokenReserveWad: 790_000_000n * one,
  perpTokenReserveWad: 99_000_000n * one,
  safetyTokenReserveWad: 100_000_000n * one,
  lockedLongTokensWad: 500_000n * one,
  circulatingSpotTokensWad: 9_000_000n * one,
  borrowedShortTokensWad: 1_000_000n * one,
  openInterestLongWei: 3n * one,
  openInterestShortWei: 2n * one,
  activePositions: 2,
  badDebtWei: 0n,
  lockedCollateralWei: one,
  lockedLongCollateralWei: one / 2n,
  lockedShortCollateralWei: one / 2n,
  lockedShortProceedsWei: one,
  syntheticLongCreditWei: one,
  cumulativeFeesWei: one / 100n,
  liquidationEquityWei: 0n,
  longCapacity2xWei: 9n * one,
  longCapacity5xWei: 8n * one,
  longCapacity10xWei: 7n * one,
  longCapacity20xWei: 6n * one,
  shortCapacityWei: 5n * one,
  stateHash: `0x${"ab".repeat(32)}`,
  blockNumber: 123n,
  receivedAt: Date.now(),
});
assert.equal(patch.chainStateSequence, 44);
assert.equal(patch.activeChainPositions, 2);
assert.equal(patch.chainLongCapacity20xEth, 6);
assert.equal(patch.shortCapacityEth, 5);
assert.equal(patch.badDebtEth, 0);

const source = await readFile(new URL("../lib/chain/v44-market-client.ts", import.meta.url), "utf8");
for (const signature of ["buy()", "sell(uint256)", "openLong(uint16,uint16,uint256)", "openShort(uint16,uint16,uint256)", "closePosition(uint256)", "quotePositionEquityWei(uint256)"]) {
  assert.ok(source.includes(signature), `V44 client is missing ${signature}`);
}
assert.ok(source.includes("waitForReceipt"), "V44 must wait for confirmation before reconciling state");
assert.ok(source.includes("readV44RuntimeState"), "V44 must refresh authoritative contract state");
console.log("V44 contract client/event reconciliation smoke: PASS");
