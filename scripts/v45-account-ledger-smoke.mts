import assert from "node:assert/strict";
import { V45AccountLedgerModel, V45ExecutionMode, V45SessionAction } from "../lib/chain/v45-account-ledger-model.ts";

const WAD = 10n ** 18n;
const account = "0x1111111111111111111111111111111111111111";
const market = "0x2222222222222222222222222222222222222222";
const sessionId = `0x${"33".repeat(32)}`;
const keyHash = `0x${"44".repeat(32)}`;
const ledger = new V45AccountLedgerModel();

ledger.deposit(account, 5n * WAD);
assert.equal(ledger.accountWeth(account), 5n * WAD);
assert.equal(ledger.routerEthWei, ledger.totalWethLiabilityWei);
ledger.debitTradeCost(account, WAD);
assert.equal(ledger.accountWeth(account), 4n * WAD);
ledger.creditTradePayout(account, WAD / 2n);
assert.equal(ledger.accountWeth(account), 45n * WAD / 10n);
ledger.creditToken(account, market, 1_000n * WAD);
assert.equal(ledger.accountToken(account, market), 1_000n * WAD);
ledger.debitToken(account, market, 250n * WAD);
assert.equal(ledger.accountToken(account, market), 750n * WAD);
ledger.withdraw(account, WAD / 2n);
assert.equal(ledger.routerEthWei, ledger.totalWethLiabilityWei);

const now = 1_000;
ledger.authorize({
  sessionId, owner: account, publicKeyHash: keyHash, validUntil: now + 3_600,
  maxNotionalWei: WAD, maxCumulativeNotionalWei: 2n * WAD,
  actionBitmap: (1n << 1n) | (1n << 3n) | (1n << 5n), now,
});
ledger.consume({ sessionId, owner: account, nonce: 0, action: V45SessionAction.SpotBuy, notionalWei: WAD / 2n, countsTowardLimit: true, deadline: now + 30, intentHash: `0x${"55".repeat(32)}`, now });
ledger.consume({ sessionId, owner: account, nonce: 1, action: V45SessionAction.OpenLong, notionalWei: WAD, countsTowardLimit: true, deadline: now + 30, intentHash: `0x${"66".repeat(32)}`, now });
ledger.consume({ sessionId, owner: account, nonce: 2, action: V45SessionAction.CloseLong, notionalWei: 0n, countsTowardLimit: false, deadline: now + 30, intentHash: `0x${"77".repeat(32)}`, now });
assert.equal(ledger.sessions.get(sessionId)?.spentNotionalWei, 15n * WAD / 10n);
assert.throws(() => ledger.consume({ sessionId, owner: account, nonce: 3, action: V45SessionAction.OpenLong, notionalWei: WAD, countsTowardLimit: true, deadline: now + 30, intentHash: `0x${"88".repeat(32)}`, now }), /Cumulative/);
assert.throws(() => ledger.consume({ sessionId, owner: account, nonce: 2, action: V45SessionAction.CloseLong, notionalWei: 0n, countsTowardLimit: false, deadline: now + 30, intentHash: `0x${"77".repeat(32)}`, now }), /nonce|consumed/i);
ledger.revoke(sessionId, account);
assert.throws(() => ledger.consume({ sessionId, owner: account, nonce: 3, action: V45SessionAction.CloseLong, notionalWei: 0n, countsTowardLimit: false, deadline: now + 30, intentHash: `0x${"99".repeat(32)}`, now }), /inactive/i);

ledger.executionMode = V45ExecutionMode.CloseOnly;
assert.throws(() => ledger.requireOpeningAllowed(), /disabled/);
ledger.requireCloseAllowed();
ledger.executionMode = V45ExecutionMode.Paused;
assert.throws(() => ledger.requireCloseAllowed(), /paused/);
ledger.assertWethSolvent();
ledger.assertTokenSolvent(market);
console.log("V45 account ledger/session-limit model smoke: PASS");
