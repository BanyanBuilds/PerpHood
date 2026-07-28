import { decodeUint, decodeWords, stripHex, type Hex } from "../lib/chain/abi.ts";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { eventTopic } from "../lib/chain/keccak.ts";
import { formatEth, requireRpc, run } from "./v59-mainnet-common.mts";
import { readBool, readUint } from "./v60-canary-common.mts";
import {
  V64_TRADER,
  assertSigner,
  firstMarketFromFactory,
  parseEth,
  parseTransactionHash,
  traderWallet,
  waitForReceipt,
  writeDeploymentJson,
} from "./v64-first-launch-common.mts";

const CONFIRMATION = "RUN_FIRST_LEVERAGE_X_MAINNET_TRADER_ROUNDTRIP";
if (process.env.V64_TRADER_ROUNDTRIP_CONFIRM !== CONFIRMATION) {
  throw new Error(`Trader roundtrip is locked. Set V64_TRADER_ROUNDTRIP_CONFIRM=${CONFIRMATION} only after capped Spot is deliberately opened.`);
}

const state = firstMarketFromFactory();
if (state.paused || readBool(state.factory, "globalTradingPaused()(bool)")) {
  throw new Error("The first canary market is paused. Complete the first-launch proof and open capped Spot before running the roundtrip.");
}
if (state.creator === V64_TRADER) throw new Error("The creator and first trader must be different wallets.");
const buyWei = parseEth(process.env.V64_TRADER_BUY_ETH ?? "0.001", "V64_TRADER_BUY_ETH");
const buyCap = readUint(state.market, "maxBuyWei()(uint256)");
if (buyWei <= 0n || (buyCap !== 0n && buyWei > buyCap)) throw new Error(`Trader buy exceeds the market cap of ${formatEth(buyCap)} ETH.`);
const wallet = traderWallet();
assertSigner(wallet, V64_TRADER, "Trader");
const rpc = requireRpc();

function send(target: string, signature: string, args: string[], options: { value?: bigint } = {}) {
  const command = ["send", target, signature, ...args];
  if (options.value !== undefined) command.push("--value", options.value.toString());
  command.push("--rpc-url", rpc, ...wallet.args, "--json");
  return parseTransactionHash(run("cast", command, { redact: [rpc, ...wallet.redactions] }));
}

console.log("Leverage X V64 — first trader buy/sell roundtrip\n");
console.log(`Trader: ${V64_TRADER}`);
console.log(`Market: ${state.market}`);
console.log(`Token: ${state.token}`);
console.log(`Buy: ${formatEth(buyWei)} ETH`);

run("cast", ["call", state.market, "buy(uint256)(uint256)", "0", "--value", buyWei.toString(), "--from", V64_TRADER, "--rpc-url", rpc], { redact: [rpc] });
const buyTransactionHash = send(state.market, "buy(uint256)", ["0"], { value: buyWei });
const buyReceipt = await waitForReceipt(buyTransactionHash);
if (buyReceipt.status !== "0x1") throw new Error(`Trader buy reverted: ${buyTransactionHash}`);

const tradeTopic = eventTopic("Trade(address,bool,uint256,uint256,uint256,uint256,uint256,uint256)").toLowerCase();
const buyLog = (buyReceipt.logs as Array<{ address: string; topics: Hex[]; data: Hex }> | undefined)?.find((log) =>
  log.address.toLowerCase() === state.market && log.topics[0]?.toLowerCase() === tradeTopic && BigInt(log.topics[2] ?? "0x0") === 1n,
);
if (!buyLog) throw new Error("Confirmed buy receipt does not contain the expected Leverage X Trade event.");
const buyWords = decodeWords(buyLog.data);
const boughtTokenWad = decodeUint(buyWords[1] ?? "0");
if (boughtTokenWad <= 0n) throw new Error("Trader buy produced zero tokens.");
const configuredSellBps = Math.min(9_000, Math.max(100, Number(process.env.V64_TRADER_SELL_BPS ?? 2_500)));
const sellCap = readUint(state.market, "maxSellTokenWad()(uint256)");
let sellTokenWad = boughtTokenWad * BigInt(configuredSellBps) / 10_000n;
if (sellCap !== 0n && sellTokenWad > sellCap) sellTokenWad = sellCap;
if (sellTokenWad <= 0n) throw new Error("Calculated trader sell amount is zero.");

const approveTransactionHash = send(state.token, "approve(address,uint256)", [state.market, sellTokenWad.toString()]);
const approveReceipt = await waitForReceipt(approveTransactionHash);
if (approveReceipt.status !== "0x1") throw new Error(`Token approval reverted: ${approveTransactionHash}`);
run("cast", ["call", state.market, "sell(uint256,uint256)(uint256)", sellTokenWad.toString(), "0", "--from", V64_TRADER, "--rpc-url", rpc], { redact: [rpc] });
const sellTransactionHash = send(state.market, "sell(uint256,uint256)", [sellTokenWad.toString(), "0"]);
const sellReceipt = await waitForReceipt(sellTransactionHash);
if (sellReceipt.status !== "0x1") throw new Error(`Trader sell reverted: ${sellTransactionHash}`);
const sellLog = (sellReceipt.logs as Array<{ address: string; topics: Hex[]; data: Hex }> | undefined)?.find((log) =>
  log.address.toLowerCase() === state.market && log.topics[0]?.toLowerCase() === tradeTopic && BigInt(log.topics[2] ?? "0x0") === 0n,
);
if (!sellLog) throw new Error("Confirmed sell receipt does not contain the expected Leverage X Trade event.");
const sellWords = decodeWords(sellLog.data);
const payoutWei = decodeUint(sellWords[0] ?? "0") - decodeUint(sellWords[2] ?? "0");
const finalTradeCount = readUint(state.market, "tradeCount()(uint256)");
if (finalTradeCount < 3n) throw new Error(`Expected genesis + buy + sell trades; market trade count is ${finalTradeCount}.`);

const result = {
  version: "V64",
  completedAt: new Date().toISOString(),
  factory: state.factory,
  market: state.market,
  token: state.token,
  trader: V64_TRADER,
  buy: {
    transactionHash: buyTransactionHash,
    blockNumber: Number(BigInt(buyReceipt.blockNumber ?? "0x0")),
    grossEthWei: decodeUint(buyWords[0] ?? "0").toString(),
    tokenOutWad: boughtTokenWad.toString(),
    feeWei: decodeUint(buyWords[2] ?? "0").toString(),
    marketCapEthWadAfter: decodeUint(buyWords[5] ?? "0").toString(),
  },
  approve: { transactionHash: approveTransactionHash },
  sell: {
    transactionHash: sellTransactionHash,
    blockNumber: Number(BigInt(sellReceipt.blockNumber ?? "0x0")),
    tokenInWad: sellTokenWad.toString(),
    grossEthWei: decodeUint(sellWords[0] ?? "0").toString(),
    feeWei: decodeUint(sellWords[2] ?? "0").toString(),
    payoutWei: payoutWei.toString(),
    marketCapEthWadAfter: decodeUint(sellWords[5] ?? "0").toString(),
  },
  finalTradeCount: finalTradeCount.toString(),
  explorer: {
    buy: `https://robinhoodchain.blockscout.com/tx/${buyTransactionHash}`,
    approve: `https://robinhoodchain.blockscout.com/tx/${approveTransactionHash}`,
    sell: `https://robinhoodchain.blockscout.com/tx/${sellTransactionHash}`,
  },
};
writeDeploymentJson("v64-trader-roundtrip.json", result);
writeFileSync(resolve("deployments", "v64-vercel-roundtrip.env"), [
  `V64_TRADER_BUY_TX_HASH=${buyTransactionHash}`,
  `V64_TRADER_APPROVE_TX_HASH=${approveTransactionHash}`,
  `V64_TRADER_SELL_TX_HASH=${sellTransactionHash}`,
  "",
].join("\n"));
console.log(JSON.stringify(result, null, 2));
console.log("\nROUNDTRIP CONFIRMED — one external trader buy and sell are now publicly provable.");
