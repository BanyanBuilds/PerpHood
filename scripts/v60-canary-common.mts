import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  DEFAULT_DEPLOYER,
  DEFAULT_FIRST_TRADER,
  V59_NETWORK,
  encodeAddressWord,
  hexToBigInt,
  normalizeAddress,
  redactRpc,
  requireRpc,
  rpcRequest,
  run,
  walletArgs,
} from "./v59-mainnet-common.mts";

export const V60_CANARY_CREATOR = normalizeAddress(
  process.env.V60_CANARY_CREATOR_ADDRESS,
  "V60_CANARY_CREATOR_ADDRESS",
  DEFAULT_DEPLOYER,
);
export const V60_FIRST_TRADER = normalizeAddress(
  process.env.V59_FIRST_TRADER_ADDRESS,
  "V59_FIRST_TRADER_ADDRESS",
  DEFAULT_FIRST_TRADER,
);
export const V60_MAX_BUY_WEI = 10_000_000_000_000_000n; // 0.01 ETH
export const V60_MAX_SELL_TOKEN_WAD = 5_000_000n * 10n ** 18n;

export function factoryAddress() {
  const direct = process.env.LEVERAGEX_FACTORY_ADDRESS
    ?? process.env.V59_MAINNET_FACTORY_ADDRESS
    ?? process.env.NEXT_PUBLIC_LEVERAGEX_FACTORY_ADDRESS;
  if (direct) return normalizeAddress(direct, "LEVERAGEX_FACTORY_ADDRESS");

  const manifestPath = resolve("deployments", "leveragex-mainnet.json");
  if (existsSync(manifestPath)) {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { deployment?: { factoryAddress?: string } };
    if (manifest.deployment?.factoryAddress) {
      return normalizeAddress(manifest.deployment.factoryAddress, "deployment manifest factory address");
    }
  }
  throw new Error("Factory address is missing. Complete V59 deployment first, then set LEVERAGEX_FACTORY_ADDRESS or keep deployments/leveragex-mainnet.json.");
}

export function requireOwnerWallet() {
  const wallet = walletArgs();
  return wallet;
}

export function castCall(factory: string, signature: string, args: string[] = []) {
  const rpc = requireRpc();
  return run("cast", ["call", factory, signature, ...args, "--rpc-url", rpc], { redact: [rpc] }).trim().toLowerCase();
}

export function readAddress(factory: string, signature: string, args: string[] = []) {
  return normalizeAddress(castCall(factory, signature, args).match(/0x[0-9a-f]{40}/i)?.[0], signature);
}

export function readBool(factory: string, signature: string, args: string[] = []) {
  const value = castCall(factory, signature, args);
  if (value === "true" || value.endsWith(" 1")) return true;
  if (value === "false" || value.endsWith(" 0")) return false;
  if (/^0x[0-9a-f]+$/.test(value)) return BigInt(value) !== 0n;
  throw new Error(`Could not decode ${signature}: ${value}`);
}

export function readUint(factory: string, signature: string, args: string[] = []) {
  const value = castCall(factory, signature, args).split(/\s+/)[0];
  if (/^0x[0-9a-f]+$/.test(value)) return BigInt(value);
  if (/^\d+$/.test(value)) return BigInt(value);
  throw new Error(`Could not decode ${signature}: ${value}`);
}

export async function assertMainnet(rpc: string) {
  const chainId = Number(hexToBigInt(await rpcRequest<string>(rpc, "eth_chainId")));
  if (chainId !== V59_NETWORK.chainId) throw new Error(`Wrong network: ${chainId}; expected Robinhood Chain mainnet ${V59_NETWORK.chainId}.`);
}

export async function assertEoa(rpc: string, address: string, label: string) {
  const code = await rpcRequest<string>(rpc, "eth_getCode", [address, "latest"]);
  if (code !== "0x") throw new Error(`${label} ${address} is a contract. V60 requires a directly controlled EOA for the first canary.`);
}

export function assertOwnerSigner(factory: string) {
  const wallet = requireOwnerWallet();
  const signer = normalizeAddress(run("cast", ["wallet", "address", ...wallet.args], { redact: wallet.redactions }), "configured signer");
  const owner = readAddress(factory, "owner()(address)");
  if (signer !== owner) throw new Error(`Configured signer ${signer} is not factory owner ${owner}.`);
  return { wallet, signer, owner };
}

export function sendOwner(factory: string, signature: string, args: string[]) {
  const rpc = requireRpc();
  const { wallet } = assertOwnerSigner(factory);
  const output = run("cast", [
    "send", factory, signature, ...args,
    "--rpc-url", rpc,
    ...wallet.args,
    "--json",
  ], { redact: [rpc, ...wallet.redactions] });
  let transactionHash = "";
  try {
    const parsed = JSON.parse(output) as Record<string, unknown>;
    transactionHash = String(parsed.transactionHash ?? parsed.transaction_hash ?? "").toLowerCase();
  } catch {
    transactionHash = output.match(/0x[0-9a-fA-F]{64}/)?.[0]?.toLowerCase() ?? "";
  }
  if (!/^0x[0-9a-f]{64}$/.test(transactionHash)) {
    throw new Error(`Owner transaction completed but no transaction hash was parsed for ${signature}. Check the explorer before retrying.`);
  }
  return transactionHash;
}

export function snapshot(factory: string) {
  const count = readUint(factory, "marketCount()(uint256)");
  const market = count > 0n ? readAddress(factory, "marketAt(uint256)(address)", ["0"]) : null;
  return {
    factory,
    owner: readAddress(factory, "owner()(address)"),
    launchMode: Number(readUint(factory, "launchMode()(uint8)")),
    globalTradingPaused: readBool(factory, "globalTradingPaused()(bool)"),
    newMarketsPaused: readBool(factory, "newMarketsPaused()(bool)"),
    defaultMaxBuyWei: readUint(factory, "defaultMaxBuyWei()(uint256)"),
    defaultMaxSellTokenWad: readUint(factory, "defaultMaxSellTokenWad()(uint256)"),
    canaryCreatorAllowed: readBool(factory, "canaryCreator(address)(bool)", [V60_CANARY_CREATOR]),
    activeCanaryCreator: readAddress(factory, "activeCanaryCreator()(address)"),
    marketCount: count,
    firstMarket: market,
  };
}

export function marketSnapshot(factory: string, market: string) {
  const normalized = normalizeAddress(market, "V60_CANARY_MARKET_ADDRESS");
  const registered = readBool(factory, "isMarket(address)(bool)", [normalized]);
  if (!registered) throw new Error(`${normalized} is not registered by the configured Leverage X factory.`);
  return {
    market: normalized,
    registered,
    creator: readAddress(normalized, "creator()(address)"),
    token: readAddress(normalized, "token()(address)"),
    paused: readBool(normalized, "paused()(bool)"),
    maxBuyWei: readUint(normalized, "maxBuyWei()(uint256)"),
    maxSellTokenWad: readUint(normalized, "maxSellTokenWad()(uint256)"),
    tradeCount: readUint(normalized, "tradeCount()(uint256)"),
  };
}

export function writeJson(filename: string, value: unknown) {
  mkdirSync(resolve("deployments"), { recursive: true });
  const path = resolve("deployments", filename);
  writeFileSync(path, `${JSON.stringify(value, (_key, item) => typeof item === "bigint" ? item.toString() : item, 2)}\n`);
  return path;
}

export function vercelCanaryEnv(factory: string, stage: string, enabled: boolean) {
  return [
    `LEVERAGEX_FACTORY_ADDRESS=${factory}`,
    `NEXT_PUBLIC_LEVERAGEX_FACTORY_ADDRESS=${factory}`,
    `NEXT_PUBLIC_V56_MAINNET_FACTORY_ADDRESS=${factory}`,
    `NEXT_PUBLIC_LEVERAGEX_CANARY_CREATOR_ADDRESS=${V60_CANARY_CREATOR}`,
    `NEXT_PUBLIC_LEVERAGEX_MAINNET_ENABLED=${enabled ? "true" : "false"}`,
    `NEXT_PUBLIC_V56_MAINNET_ENABLED=${enabled ? "true" : "false"}`,
    `NEXT_PUBLIC_LEVERAGEX_RELEASE_STAGE=${stage}`,
    "",
  ].join("\n");
}

export { V59_NETWORK, encodeAddressWord, hexToBigInt, normalizeAddress, redactRpc, requireRpc, rpcRequest };
