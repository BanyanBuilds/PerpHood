import assert from "node:assert/strict";
import { decodeWords } from "../lib/chain/abi.ts";
import { keccak256 } from "../lib/chain/keccak.ts";
import {
  buildSpotBuySettlement,
  COMMIT_SINGLE_ACCOUNT_SIGNATURE,
  encodeSingleAccountSettlement,
} from "../lib/chain/settlement-frame.ts";
import { functionSelector } from "../lib/chain/keccak.ts";

const hash = (value: string) => keccak256(value);
const settlement = buildSpotBuySettlement({
  expectedSequence: 1n,
  expectedPreviousStateHash: hash("genesis"),
  marketId: hash("market"),
  trader: "0x00000000000000000000000000000000000a11ce",
  grossWethWad: 1n * 10n ** 18n,
  tokenOut: 100_000_000n * 10n ** 18n,
  marginalPriceWad: 250_000_000n,
  marketCapWad: 2_500_000_000_000_000_000n,
  reservedWethWad: 0n,
  positionsRoot: hash("positions"),
  balancesRoot: hash("balances"),
  intentHash: hash("intent"),
});
const encoded = encodeSingleAccountSettlement(settlement);
assert.equal(encoded.slice(0, 10), functionSelector(COMMIT_SINGLE_ACCOUNT_SIGNATURE));
assert.equal(decodeWords(`0x${encoded.slice(10)}`).length, 17, "static tuple call must encode seventeen ABI words");
assert.throws(() => encodeSingleAccountSettlement({ ...settlement, poolWethDeltaWad: 0n }), /conserve/);
console.log("V21 sequencer-to-contract frame builder passed.");
