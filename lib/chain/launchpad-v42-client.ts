import { encodeBytes32, encodeUint, stripHex, toRpcHex, toWad, type Hex } from "./abi.ts";
import { eventTopic, functionSelector, keccak256 } from "./keccak.ts";
import {
  DEFAULT_LOCAL_RPC,
  connectLocalWallet,
  injectedProvider,
  rpcRequest,
  waitForReceipt,
  type Eip1193Provider,
} from "./local-battle-client.ts";

export const V42_FACTORY_EVENT = "MarketCreated(address,address,address,uint256,uint256,bytes32)";

export type V42LaunchInput = {
  name: string;
  symbol: string;
  description: string;
  creatorBuyEth: number;
  migrationTargetMarketCapUsd: number;
  imageExactHash?: string;
  website?: string;
  xHandle?: string;
  telegram?: string;
};

export type V42LaunchReceipt = {
  account: string;
  transactionHash: Hex;
  marketAddress?: string;
  tokenAddress?: string;
  creatorAddress?: string;
  blockNumber?: number;
};

type RpcLog = { address: string; topics: Hex[]; data: Hex };
type TransactionReceipt = { blockNumber?: Hex; logs?: RpcLog[]; status?: Hex };

function utf8Hex(value: string) {
  return Array.from(new TextEncoder().encode(value), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function padRightWord(hex: string) {
  const remainder = hex.length % 64;
  return remainder === 0 ? hex : hex.padEnd(hex.length + 64 - remainder, "0");
}

export function encodeDynamicString(value: string) {
  const hex = utf8Hex(value);
  return `${encodeUint(hex.length / 2)}${padRightWord(hex)}`;
}

export function encodeV42CreateMarket(
  name: string,
  symbol: string,
  metadataHash: Hex,
  targetUsdWad: bigint,
) {
  const nameTail = encodeDynamicString(name);
  const symbolTail = encodeDynamicString(symbol);
  const headBytes = 4 * 32;
  const symbolOffset = headBytes + nameTail.length / 2;
  return `${functionSelector("createSandboxMarket(string,string,bytes32,uint256)")}${encodeUint(headBytes)}${encodeUint(symbolOffset)}${encodeBytes32(metadataHash)}${encodeUint(targetUsdWad)}${nameTail}${symbolTail}` as Hex;
}

export function v42MetadataHash(input: V42LaunchInput) {
  return keccak256(JSON.stringify({
    name: input.name.trim(),
    symbol: input.symbol.trim().toUpperCase(),
    description: input.description.trim(),
    imageExactHash: input.imageExactHash ?? "",
    website: input.website?.trim() ?? "",
    xHandle: input.xHandle?.trim() ?? "",
    telegram: input.telegram?.trim() ?? "",
  })) as Hex;
}

function addressFromTopic(topic?: string) {
  if (!topic) return undefined;
  return `0x${stripHex(topic).slice(-40)}`;
}

export function parseV42MarketCreated(receipt: TransactionReceipt): Pick<V42LaunchReceipt, "marketAddress" | "tokenAddress" | "creatorAddress" | "blockNumber"> {
  const topic = eventTopic(V42_FACTORY_EVENT).toLowerCase();
  const log = receipt.logs?.find((entry) => entry.topics[0]?.toLowerCase() === topic);
  return {
    marketAddress: addressFromTopic(log?.topics[1]),
    tokenAddress: addressFromTopic(log?.topics[2]),
    creatorAddress: addressFromTopic(log?.topics[3]),
    blockNumber: receipt.blockNumber ? Number(BigInt(receipt.blockNumber)) : undefined,
  };
}

export async function launchV42Market(
  input: V42LaunchInput,
  factoryAddress: string,
  provider: Eip1193Provider | null = injectedProvider(),
  rpcUrl = process.env.NEXT_PUBLIC_LOCAL_CHAIN_RPC ?? DEFAULT_LOCAL_RPC,
): Promise<V42LaunchReceipt> {
  if (!provider) throw new Error("No injected EVM wallet was found.");
  if (!/^0x[0-9a-fA-F]{40}$/.test(factoryAddress)) throw new Error("The V42 local factory address is invalid.");
  const account = await connectLocalWallet(provider);
  const creatorBuyWad = toWad(input.creatorBuyEth);
  if (creatorBuyWad <= 0n) throw new Error("Creator buy must be greater than zero.");
  const data = encodeV42CreateMarket(
    input.name,
    input.symbol,
    v42MetadataHash(input),
    BigInt(Math.round(input.migrationTargetMarketCapUsd)) * 10n ** 18n,
  );
  const transactionHash = await provider.request<Hex>({
    method: "eth_sendTransaction",
    params: [{
      from: account,
      to: factoryAddress,
      data,
      value: toRpcHex(creatorBuyWad),
    }],
  });
  const receipt = await waitForReceipt(transactionHash, rpcUrl) as TransactionReceipt;
  if (receipt.status === "0x0") throw new Error("The V42 local launch transaction reverted.");
  return { account, transactionHash, ...parseV42MarketCreated(receipt) };
}

export async function readV42FactoryMarketCount(
  factoryAddress: string,
  rpcUrl = process.env.NEXT_PUBLIC_LOCAL_CHAIN_RPC ?? DEFAULT_LOCAL_RPC,
) {
  const selector = functionSelector("marketCount()");
  const result = await rpcRequest<Hex>(rpcUrl, "eth_call", [{ to: factoryAddress, data: selector }, "latest"]);
  return Number(BigInt(result));
}
