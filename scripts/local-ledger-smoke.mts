import assert from "node:assert/strict";
import { LocalLedgerModel } from "../lib/chain/local-ledger-model.ts";

const ETH = 10n ** 18n;
const TOKEN = 10n ** 18n;
const alice = "0x00000000000000000000000000000000000a11ce";
const ledger = new LocalLedgerModel(5n * ETH, 1_000_000_000n * TOKEN);
ledger.deposit(alice, 2n * ETH);

ledger.commit({
  sequence: 1,
  previousStateHash: "genesis",
  stateHash: "spot-buy-1",
  poolWethDeltaWad: 1n * ETH,
  poolTokenDelta: -100_000_000n * TOKEN,
  reservedWethWad: 0n,
  deltas: [{ account: alice, wethDeltaWad: -1n * ETH, tokenDelta: 100_000_000n * TOKEN }],
});
assert.equal(ledger.poolWethWad, 6n * ETH);
assert.equal(ledger.balance(alice).wethWad, 1n * ETH);
assert.equal(ledger.balance(alice).tokenAmount, 100_000_000n * TOKEN);

ledger.commit({
  sequence: 2,
  previousStateHash: "spot-buy-1",
  stateHash: "short-payout-2",
  poolWethDeltaWad: -750_000_000_000_000_000n,
  poolTokenDelta: 0n,
  reservedWethWad: 500_000_000_000_000_000n,
  deltas: [{ account: alice, wethDeltaWad: 750_000_000_000_000_000n, tokenDelta: 0n }],
});
assert.equal(ledger.balance(alice).wethWad, 1_750_000_000_000_000_000n);
assert.equal(ledger.availablePoolWethWad(), 4_750_000_000_000_000_000n);

ledger.withdrawWeth(alice, 1n * ETH);
ledger.withdrawToken(alice, 10_000_000n * TOKEN);
ledger.assertInvariants();

assert.throws(() => ledger.commit({
  sequence: 4,
  previousStateHash: "short-payout-2",
  stateHash: "skip",
  poolWethDeltaWad: 0n,
  poolTokenDelta: 0n,
  reservedWethWad: 0n,
  deltas: [],
}), /sequence/);

assert.throws(() => ledger.commit({
  sequence: 3,
  previousStateHash: "short-payout-2",
  stateHash: "unbalanced",
  poolWethDeltaWad: 0n,
  poolTokenDelta: 0n,
  reservedWethWad: 0n,
  deltas: [{ account: alice, wethDeltaWad: 1n, tokenDelta: 0n }],
}), /Unbalanced/);

console.log("V21 local custody ledger smoke test passed.");
