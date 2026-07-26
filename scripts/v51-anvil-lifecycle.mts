import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { decodeUint, decodeWords, encodeAddress, encodeCall, encodeUint, toRpcHex, type Hex } from "../lib/chain/abi.ts";
import { eventTopic } from "../lib/chain/keccak.ts";

const RPC_URL = process.env.LOCAL_CHAIN_RPC ?? "http://127.0.0.1:8545";
const DEPLOYMENT_PATH = resolve("public/local-chain/v45-deployment.json");
const REPORT_PATH = resolve("public/local-chain/v51-chain-assault.json");
const WAD = 10n ** 18n;
let rpcId = 0;

type Receipt = { status?: Hex; blockNumber?: Hex; gasUsed?: Hex; transactionHash?: Hex; logs?: Array<{ address: Hex; topics: Hex[]; data: Hex }> };
type V45Manifest = { factoryAddress: Hex; accountRouterAddress: Hex; demoMarketAddress: Hex; demoTokenAddress: Hex; spotTrader: Hex };

async function rpc<T>(method: string, params: unknown[] = []): Promise<T> {
  const response = await fetch(RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params }),
  });
  if (!response.ok) throw new Error(`RPC HTTP ${response.status}`);
  const payload = await response.json() as { result?: T; error?: { code: number; message: string } };
  if (payload.error) throw new Error(`RPC ${payload.error.code}: ${payload.error.message}`);
  if (payload.result === undefined) throw new Error(`RPC ${method} returned no result.`);
  return payload.result;
}

async function waitForReceipt(hash: Hex, timeoutMs = 45_000): Promise<Receipt> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const receipt = await rpc<Receipt | null>("eth_getTransactionReceipt", [hash]);
    if (receipt) return receipt;
    await new Promise((resolve) => setTimeout(resolve, 80));
  }
  throw new Error(`Timed out waiting for ${hash}`);
}

async function call(from: Hex, to: Hex, data: Hex) {
  return rpc<Hex>("eth_call", [{ from, to, data }, "latest"]);
}

async function send(from: Hex, to: Hex, data: Hex, value = 0n, expectRevert = false) {
  const request = { from, to, data, ...(value > 0n ? { value: toRpcHex(value) } : {}) };
  let gas = 8_000_000n;
  if (!expectRevert) {
    const estimated = await rpc<Hex>("eth_estimateGas", [request]);
    gas = BigInt(estimated) * 13n / 10n;
  }
  const hash = await rpc<Hex>("eth_sendTransaction", [{ ...request, gas: toRpcHex(gas) }]);
  const receipt = await waitForReceipt(hash);
  if (expectRevert) assert.equal(receipt.status, "0x0", `Expected ${hash} to revert.`);
  else assert.notEqual(receipt.status, "0x0", `Expected ${hash} to succeed.`);
  return { hash, receipt };
}

async function uintCall(from: Hex, to: Hex, signature: string, values: string[] = []) {
  const result = await call(from, to, encodeCall(signature, values));
  return decodeUint(decodeWords(result)[0] ?? "0");
}

function min98(value: bigint) { return value * 9_800n / 10_000n; }
function max1002(value: bigint) { return (value * 10_020n + 9_999n) / 10_000n; }
function gasUsed(receipt: Receipt) { return receipt.gasUsed ? BigInt(receipt.gasUsed).toString() : "0"; }
function blockNumber(receipt: Receipt) { return receipt.blockNumber ? Number(BigInt(receipt.blockNumber)) : 0; }

const manifest = JSON.parse(await readFile(DEPLOYMENT_PATH, "utf8")) as V45Manifest;
assert.match(manifest.factoryAddress, /^0x[0-9a-fA-F]{40}$/);
assert.match(manifest.demoMarketAddress, /^0x[0-9a-fA-F]{40}$/);
const router = manifest.accountRouterAddress ?? manifest.factoryAddress;
const market = manifest.demoMarketAddress;
const accounts = await rpc<Hex[]>("eth_accounts");
assert(accounts.length >= 7, "V51 Anvil assault requires at least seven unlocked accounts.");
const trader = accounts[6];
const frontrunner = manifest.spotTrader ?? accounts[3];
const now = Math.floor(Date.now() / 1_000);
const deadline = now + 300;
const txs: Record<string, { hash: Hex; blockNumber: number; gasUsed: string; reverted?: boolean }> = {};

const deposit = await send(trader, router, encodeCall("deposit()"), 5n * WAD);
txs.deposit = { hash: deposit.hash, blockNumber: blockNumber(deposit.receipt), gasUsed: gasUsed(deposit.receipt) };

const buyAmount = WAD / 10n;
const staleQuote = await uintCall(trader, router, "spotBuyFromBalance(address,uint256,uint256)", [encodeAddress(market), encodeUint(buyAmount), encodeUint(0)]);
const frontRun = await send(
  frontrunner,
  router,
  encodeCall("spotBuyFromBalanceWithLimits(address,uint256,uint256,uint64)", [encodeAddress(market), encodeUint(WAD / 2n), encodeUint(0), encodeUint(deadline)]),
);
txs.frontRunBuy = { hash: frontRun.hash, blockNumber: blockNumber(frontRun.receipt), gasUsed: gasUsed(frontRun.receipt) };

const balanceBeforeStale = await uintCall(trader, router, "wethBalanceWei(address)", [encodeAddress(trader)]);
const sequenceBeforeStale = await uintCall(trader, market, "stateSequence()");
const stale = await send(
  trader,
  router,
  encodeCall("spotBuyFromBalanceWithLimits(address,uint256,uint256,uint64)", [encodeAddress(market), encodeUint(buyAmount), encodeUint(staleQuote), encodeUint(deadline)]),
  0n,
  true,
);
txs.staleBuy = { hash: stale.hash, blockNumber: blockNumber(stale.receipt), gasUsed: gasUsed(stale.receipt), reverted: true };
assert.equal(await uintCall(trader, router, "wethBalanceWei(address)", [encodeAddress(trader)]), balanceBeforeStale, "Stale buy changed account balance.");
assert.equal(await uintCall(trader, market, "stateSequence()"), sequenceBeforeStale, "Stale buy changed market sequence.");

const freshBuyQuote = await uintCall(trader, router, "spotBuyFromBalance(address,uint256,uint256)", [encodeAddress(market), encodeUint(buyAmount), encodeUint(0)]);
const protectedBuy = await send(
  trader,
  router,
  encodeCall("spotBuyFromBalanceWithLimits(address,uint256,uint256,uint64)", [encodeAddress(market), encodeUint(buyAmount), encodeUint(min98(freshBuyQuote)), encodeUint(deadline)]),
);
txs.protectedBuy = { hash: protectedBuy.hash, blockNumber: blockNumber(protectedBuy.receipt), gasUsed: gasUsed(protectedBuy.receipt) };

const longCollateral = WAD / 100n;
const longQuoteWords = decodeWords(await call(trader, market, encodeCall("quoteOpenLong(uint256,uint16)", [encodeUint(longCollateral), encodeUint(2)]))).map(decodeUint);
const protectedLong = await send(
  trader,
  router,
  encodeCall("openLongFromBalanceWithLimits(address,uint16,uint16,uint256,uint256,uint64)", [
    encodeAddress(market), encodeUint(2), encodeUint(200), encodeUint(longCollateral), encodeUint(min98(longQuoteWords[3] ?? 0n)), encodeUint(deadline),
  ]),
);
txs.protectedLong = { hash: protectedLong.hash, blockNumber: blockNumber(protectedLong.receipt), gasUsed: gasUsed(protectedLong.receipt) };

const openedTopic = eventTopic("PositionOpened(uint256,address,uint8,uint16,uint256,uint256,uint256,uint256,uint256)").toLowerCase();
const longOpened = protectedLong.receipt.logs?.find((log) => log.topics[0]?.toLowerCase() === openedTopic);
assert(longOpened?.topics[1], "Protected long did not emit PositionOpened.");
const longPositionId = BigInt(longOpened.topics[1]);

const shortCollateral = WAD / 200n;
const shortQuoteWords = decodeWords(await call(trader, market, encodeCall("quoteOpenShort(uint256,uint16)", [encodeUint(shortCollateral), encodeUint(2)]))).map(decodeUint);
const protectedShort = await send(
  trader,
  router,
  encodeCall("openShortFromBalanceWithLimits(address,uint16,uint16,uint256,uint256,uint256,uint64)", [
    encodeAddress(market), encodeUint(2), encodeUint(200), encodeUint(shortCollateral), encodeUint(max1002(shortQuoteWords[3] ?? 0n)), encodeUint(min98(shortQuoteWords[4] ?? 0n)), encodeUint(deadline),
  ]),
);
txs.protectedShort = { hash: protectedShort.hash, blockNumber: blockNumber(protectedShort.receipt), gasUsed: gasUsed(protectedShort.receipt) };

const longPayout = await uintCall(trader, market, "quotePositionEquityWei(uint256)", [encodeUint(longPositionId)]);
const closeLong = await send(
  trader,
  router,
  encodeCall("closePositionFromBalanceWithLimits(address,uint256,uint256,uint64)", [encodeAddress(market), encodeUint(longPositionId), encodeUint(min98(longPayout)), encodeUint(deadline)]),
);
txs.protectedClose = { hash: closeLong.hash, blockNumber: blockNumber(closeLong.receipt), gasUsed: gasUsed(closeLong.receipt) };

const snapshot = decodeWords(await call(trader, market, encodeCall("invariantSnapshot()"))).map(decodeUint);
assert(snapshot.length >= 14, "Invariant snapshot was not fully decoded.");
for (const index of [9, 10, 11, 12, 13]) assert.equal(snapshot[index], 1n, `Invariant snapshot flag ${index} failed.`);
const routerBalance = BigInt(await rpc<Hex>("eth_getBalance", [router, "latest"]));
const routerLiability = await uintCall(trader, router, "totalWethLiabilityWei()");
assert(routerBalance >= routerLiability, "Router liabilities exceed custody.");

const report = {
  version: "v51-compiler-chain-assault",
  generatedAt: new Date().toISOString(),
  rpcUrl: RPC_URL,
  chainId: Number(BigInt(await rpc<Hex>("eth_chainId"))),
  router,
  market,
  token: manifest.demoTokenAddress,
  trader,
  staleBuyRollback: true,
  protectedLongPositionId: longPositionId.toString(),
  invariantFlags: {
    logicalTokenConservation: snapshot[9] === 1n,
    tokenCustodyMatches: snapshot[10] === 1n,
    collateralLedgerMatches: snapshot[11] === 1n,
    shortInventoryMatches: snapshot[12] === 1n,
    solvent: snapshot[13] === 1n,
  },
  routerCustodyWei: routerBalance.toString(),
  routerLiabilityWei: routerLiability.toString(),
  transactions: txs,
  result: "PASS",
};
await mkdir(dirname(REPORT_PATH), { recursive: true });
await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
