import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  DEFAULT_DEPLOYER,
  DEFAULT_FIRST_TRADER,
  V59_NETWORK,
  formatEth,
  hexToBigInt,
  normalizeAddress,
  redactRpc,
  requireRpc,
  rpcRequest,
  run,
  toRpcHex,
  walletArgsFor,
} from "./v59-mainnet-common.mts";
import { factoryAddress, readAddress, readBool, readUint, snapshot } from "./v60-canary-common.mts";

export const V64_CREATOR = normalizeAddress(process.env.V64_CREATOR_ADDRESS, "V64_CREATOR_ADDRESS", DEFAULT_DEPLOYER);
export const V64_TRADER = normalizeAddress(process.env.V64_TRADER_ADDRESS, "V64_TRADER_ADDRESS", DEFAULT_FIRST_TRADER);
export const V64_MIN_TOTAL_BUDGET_WEI = 1_000_000_000_000_000n;
export const V64_MAX_TOTAL_BUDGET_WEI = 10_000_000_000_000_000n;
export const V64_MIN_GENESIS_BUY_WEI = 1_000_000_000_000n;

export function parseEth(value: string, label: string) {
  const normalized = value.trim();
  if (!/^\d+(?:\.\d{1,18})?$/.test(normalized)) throw new Error(`${label} must be a positive ETH decimal with at most 18 decimal places.`);
  const [whole, fraction = ""] = normalized.split(".");
  return BigInt(whole) * 10n ** 18n + BigInt(fraction.padEnd(18, "0"));
}

export function tokenIdentity() {
  const name = (process.env.V64_TOKEN_NAME ?? "").trim();
  const symbol = (process.env.V64_TOKEN_SYMBOL ?? "").trim().toUpperCase();
  const metadataUri = (process.env.V64_TOKEN_METADATA_URI ?? "").trim();
  if (name.length < 2 || name.length > 64) throw new Error("V64_TOKEN_NAME must contain 2–64 characters.");
  if (!/^[A-Z0-9]{1,12}$/.test(symbol)) throw new Error("V64_TOKEN_SYMBOL must contain 1–12 uppercase letters or numbers.");
  if (!/^https:\/\//i.test(metadataUri)) throw new Error("V64_TOKEN_METADATA_URI must be a public HTTPS JSON URL for the first canary.");
  return { name, symbol, metadataUri };
}

export async function readAndVerifyMetadata() {
  const identity = tokenIdentity();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(identity.metadataUri, { cache: "no-store", signal: controller.signal });
    if (!response.ok) throw new Error(`Token metadata returned HTTP ${response.status}.`);
    const body = await response.text();
    const metadata = JSON.parse(body) as { name?: unknown; symbol?: unknown; image?: unknown; website?: unknown; twitter?: unknown; telegram?: unknown };
    if (metadata.name !== identity.name || String(metadata.symbol ?? "").toUpperCase() !== identity.symbol) {
      throw new Error("Metadata name/symbol must exactly match V64_TOKEN_NAME and V64_TOKEN_SYMBOL.");
    }
    if (typeof metadata.image !== "string" || !/^(https:\/\/|ipfs:\/\/|ar:\/\/)/i.test(metadata.image)) {
      throw new Error("Metadata must contain a public image URL using https://, ipfs://, or ar://.");
    }
    return {
      ...identity,
      metadata,
      metadataBody: body,
      metadataHash: `0x${createHash("sha256").update(body).digest("hex")}`,
    };
  } finally {
    clearTimeout(timer);
  }
}

export function configuredTotalBudgetWei() {
  const value = parseEth(process.env.V64_CREATOR_TOTAL_SPEND_ETH ?? "0.001", "V64_CREATOR_TOTAL_SPEND_ETH");
  if (value < V64_MIN_TOTAL_BUDGET_WEI) throw new Error("The creator total launch spend must be at least 0.001 ETH, inclusive of gas.");
  if (value > V64_MAX_TOTAL_BUDGET_WEI) throw new Error("The first canary total launch spend cannot exceed 0.01 ETH.");
  return value;
}

export function creatorWallet() {
  return walletArgsFor("V64_CREATOR", V64_CREATOR);
}

export function traderWallet() {
  return walletArgsFor("V64_TRADER", V64_TRADER);
}

export function signerAddress(wallet: ReturnType<typeof walletArgsFor>) {
  return normalizeAddress(run("cast", ["wallet", "address", ...wallet.args], { redact: wallet.redactions }), "configured signer");
}

export function assertSigner(wallet: ReturnType<typeof walletArgsFor>, expected: string, label: string) {
  const signer = signerAddress(wallet);
  if (signer !== expected) throw new Error(`${label} signer ${signer} does not match expected address ${expected}.`);
  return signer;
}

export function encodeCreateMarket(name: string, symbol: string, metadataUri: string, metadataHash: string) {
  return run("cast", [
    "calldata",
    "createMarket(string,string,string,bytes32,uint256)",
    name,
    symbol,
    metadataUri,
    metadataHash,
    "0",
  ]).trim();
}

export async function launchEstimate() {
  const rpc = requireRpc();
  const factory = factoryAddress();
  const metadata = await readAndVerifyMetadata();
  const totalBudgetWei = configuredTotalBudgetWei();
  const state = snapshot(factory);
  if (state.launchMode !== 1 || !state.globalTradingPaused || !state.newMarketsPaused || state.marketCount !== 0n) {
    throw new Error("Factory must be in the exact allowlisted, globally paused, zero-market canary state before the first launch.");
  }
  if (!state.canaryCreatorAllowed || state.activeCanaryCreator !== V64_CREATOR) {
    throw new Error("The configured V64 creator is not the active allowlisted canary creator.");
  }
  const creatorCode = await rpcRequest<string>(rpc, "eth_getCode", [V64_CREATOR, "latest"]);
  if (creatorCode !== "0x") throw new Error("The first creator must be a directly controlled EOA.");
  const calldata = encodeCreateMarket(metadata.name, metadata.symbol, metadata.metadataUri, metadata.metadataHash);
  const gasPriceWei = hexToBigInt(await rpcRequest<string>(rpc, "eth_gasPrice"));
  const preliminaryValue = totalBudgetWei > 100_000n * gasPriceWei ? totalBudgetWei - 100_000n * gasPriceWei : V64_MIN_GENESIS_BUY_WEI;
  const preliminaryGas = hexToBigInt(await rpcRequest<string>(rpc, "eth_estimateGas", [{
    from: V64_CREATOR,
    to: factory,
    value: toRpcHex(preliminaryValue < V64_MIN_GENESIS_BUY_WEI ? V64_MIN_GENESIS_BUY_WEI : preliminaryValue),
    data: calldata,
  }], 30_000));
  const estimatedNetworkFeeWei = preliminaryGas * gasPriceWei;
  if (estimatedNetworkFeeWei >= totalBudgetWei) throw new Error(`Estimated launch gas (${formatEth(estimatedNetworkFeeWei)} ETH) consumes the selected total budget.`);
  const genesisBuyWei = totalBudgetWei - estimatedNetworkFeeWei;
  if (genesisBuyWei < V64_MIN_GENESIS_BUY_WEI) throw new Error("Gas leaves less than the contract minimum creator buy. Increase V64_CREATOR_TOTAL_SPEND_ETH.");
  const finalGas = hexToBigInt(await rpcRequest<string>(rpc, "eth_estimateGas", [{
    from: V64_CREATOR,
    to: factory,
    value: toRpcHex(genesisBuyWei),
    data: calldata,
  }], 30_000));
  const gasLimit = finalGas * 125n / 100n + 20_000n;
  const maxGasPriceWei = gasPriceWei * 125n / 100n + 1n;
  const maxNetworkFeeWei = gasLimit * maxGasPriceWei;
  const requiredBalanceWei = genesisBuyWei + maxNetworkFeeWei;
  const creatorBalanceWei = hexToBigInt(await rpcRequest<string>(rpc, "eth_getBalance", [V64_CREATOR, "latest"]));
  return {
    version: "V64",
    generatedAt: new Date().toISOString(),
    rpc: redactRpc(rpc),
    chain: V59_NETWORK,
    factory,
    creator: V64_CREATOR,
    metadata,
    calldata,
    state,
    budget: {
      totalBudgetWei: totalBudgetWei.toString(),
      genesisBuyWei: genesisBuyWei.toString(),
      estimatedGas: finalGas.toString(),
      gasLimit: gasLimit.toString(),
      observedGasPriceWei: gasPriceWei.toString(),
      maxGasPriceWei: maxGasPriceWei.toString(),
      estimatedNetworkFeeWei: estimatedNetworkFeeWei.toString(),
      maxNetworkFeeWei: maxNetworkFeeWei.toString(),
      requiredBalanceWei: requiredBalanceWei.toString(),
      creatorBalanceWei: creatorBalanceWei.toString(),
      funded: creatorBalanceWei >= requiredBalanceWei,
    },
  };
}

export function writeDeploymentJson(filename: string, value: unknown) {
  mkdirSync(resolve("deployments"), { recursive: true });
  const path = resolve("deployments", filename);
  writeFileSync(path, `${JSON.stringify(value, (_key, item) => typeof item === "bigint" ? item.toString() : item, 2)}\n`);
  return path;
}

export function readDeploymentJson<T>(filename: string): T {
  const path = resolve("deployments", filename);
  if (!existsSync(path)) throw new Error(`Missing ${path}. Run the required prior V64 command first.`);
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

export async function waitForReceipt(transactionHash: string, timeoutMs = 120_000) {
  const rpc = requireRpc();
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const receipt = await rpcRequest<Record<string, any> | null>(rpc, "eth_getTransactionReceipt", [transactionHash]);
    if (receipt) return receipt;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 2_000));
  }
  throw new Error(`Timed out waiting for ${transactionHash}. Check the explorer before retrying.`);
}

export function parseTransactionHash(output: string) {
  try {
    const parsed = JSON.parse(output) as Record<string, unknown>;
    const value = String(parsed.transactionHash ?? parsed.transaction_hash ?? "").toLowerCase();
    if (/^0x[0-9a-f]{64}$/.test(value)) return value;
  } catch {}
  const value = output.match(/0x[0-9a-fA-F]{64}/)?.[0]?.toLowerCase() ?? "";
  if (!/^0x[0-9a-f]{64}$/.test(value)) throw new Error("A transaction was sent but its hash could not be parsed. Check the explorer before retrying.");
  return value;
}

export function firstMarketFromFactory(factory = factoryAddress()) {
  const count = readUint(factory, "marketCount()(uint256)");
  if (count !== 1n) throw new Error(`Expected exactly one canary market; found ${count}.`);
  const market = readAddress(factory, "marketAt(uint256)(address)", ["0"]);
  const token = readAddress(market, "token()(address)");
  return {
    factory,
    market,
    token,
    creator: readAddress(market, "creator()(address)"),
    paused: readBool(market, "paused()(bool)"),
    tradeCount: readUint(market, "tradeCount()(uint256)"),
  };
}
