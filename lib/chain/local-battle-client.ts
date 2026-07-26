import {
  decodeBytes32,
  decodeUint,
  decodeWords,
  encodeAddress,
  encodeCall,
  encodeUint,
  fromWad,
  toRpcHex,
  type Hex,
} from "./abi.ts";
import { encodeSingleAccountSettlement, type SingleAccountSettlement } from "./settlement-frame.ts";


export const LOCAL_CHAIN_ID = 31_337;
export const LOCAL_CHAIN_HEX = "0x7a69";
export const DEFAULT_LOCAL_RPC = "http://127.0.0.1:8545";

export type Eip1193Provider = {
  request<T = unknown>(args: { method: string; params?: unknown[] | Record<string, unknown> }): Promise<T>;
};

export type LocalBattleState = {
  sequence: number;
  committedAt: number;
  marketId: Hex;
  action: number;
  marginalPriceWad: bigint;
  marketCapWad: bigint;
  poolWethWad: bigint;
  poolTokenAmount: bigint;
  reservedWethWad: bigint;
  openInterestLongWad: bigint;
  openInterestShortWad: bigint;
  positionsRoot: Hex;
  balancesRoot: Hex;
  stateHash: Hex;
  availablePoolWethWad: bigint;
  custodySolvent: boolean;
  blockNumber: bigint;
  receivedAt: number;
  rpcLatencyMs: number;
};

export type LocalAccountBalance = {
  wethWad: bigint;
  tokenAmount: bigint;
};

export type RpcRequest = {
  id: number;
  jsonrpc: "2.0";
  method: string;
  params: unknown[];
};

let rpcId = 0;

export async function rpcRequest<T>(rpcUrl: string, method: string, params: unknown[] = []): Promise<T> {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: ++rpcId, jsonrpc: "2.0", method, params } satisfies RpcRequest),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`RPC HTTP ${response.status}`);
  const payload = await response.json() as { result?: T; error?: { code: number; message: string; data?: unknown } };
  if (payload.error) throw new Error(`RPC ${payload.error.code}: ${payload.error.message}`);
  if (payload.result === undefined) throw new Error(`RPC ${method} returned no result.`);
  return payload.result;
}

export async function ethCall(rpcUrl: string, contract: string, data: Hex): Promise<Hex> {
  return rpcRequest<Hex>(rpcUrl, "eth_call", [{ to: contract, data }, "latest"]);
}

export async function readSingleUint(rpcUrl: string, contract: string, signature: string) {
  const result = await ethCall(rpcUrl, contract, encodeCall(signature));
  const [word] = decodeWords(result);
  if (!word) throw new Error(`${signature} returned no ABI word.`);
  return decodeUint(word);
}

export async function readLocalBattleState(
  rpcUrl = DEFAULT_LOCAL_RPC,
  contractAddress?: string,
): Promise<LocalBattleState> {
  if (!contractAddress) throw new Error("NEXT_PUBLIC_LOCAL_BATTLE_POOL_ADDRESS is not configured.");
  const startedAt = performance.now();
  const [runtimeResult, blockHex] = await Promise.all([
    ethCall(rpcUrl, contractAddress, encodeCall("runtimeState()")),
    rpcRequest<Hex>(rpcUrl, "eth_blockNumber"),
  ]);
  const words = decodeWords(runtimeResult);
  if (words.length < 16) throw new Error(`Unexpected runtimeState word count: ${words.length}`);
  return {
    sequence: Number(decodeUint(words[0])),
    committedAt: Number(decodeUint(words[1])) * 1_000,
    marketId: decodeBytes32(words[2]),
    action: Number(decodeUint(words[3])),
    marginalPriceWad: decodeUint(words[4]),
    marketCapWad: decodeUint(words[5]),
    poolWethWad: decodeUint(words[6]),
    poolTokenAmount: decodeUint(words[7]),
    reservedWethWad: decodeUint(words[8]),
    openInterestLongWad: decodeUint(words[9]),
    openInterestShortWad: decodeUint(words[10]),
    positionsRoot: decodeBytes32(words[11]),
    balancesRoot: decodeBytes32(words[12]),
    stateHash: decodeBytes32(words[13]),
    availablePoolWethWad: decodeUint(words[14]),
    custodySolvent: decodeUint(words[15]) === 1n,
    blockNumber: BigInt(blockHex),
    receivedAt: Date.now(),
    rpcLatencyMs: performance.now() - startedAt,
  };
}

export async function readLocalAccountBalance(
  account: string,
  rpcUrl = DEFAULT_LOCAL_RPC,
  contractAddress?: string,
): Promise<LocalAccountBalance> {
  if (!contractAddress) throw new Error("BattlePool contract address is not configured.");
  const result = await ethCall(rpcUrl, contractAddress, encodeCall("accountBalance(address)", [encodeAddress(account)]));
  const words = decodeWords(result);
  if (words.length < 2) throw new Error("Malformed accountBalance response.");
  return { wethWad: decodeUint(words[0]), tokenAmount: decodeUint(words[1]) };
}

export function formatWad(value: bigint, precision = 5) {
  return `${fromWad(value, precision).toFixed(precision).replace(/0+$/, "").replace(/\.$/, "")}`;
}

export function injectedProvider(): Eip1193Provider | null {
  if (typeof window === "undefined") return null;
  return (window as typeof window & { ethereum?: Eip1193Provider }).ethereum ?? null;
}

export async function connectLocalWallet(provider = injectedProvider()) {
  if (!provider) throw new Error("No injected EVM wallet was found.");
  const chainId = await provider.request<string>({ method: "eth_chainId" });
  if (chainId.toLowerCase() !== LOCAL_CHAIN_HEX) {
    try {
      await provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: LOCAL_CHAIN_HEX }],
      });
    } catch {
      await provider.request({
        method: "wallet_addEthereumChain",
        params: [{
          chainId: LOCAL_CHAIN_HEX,
          chainName: "PERPHOOD Local Battle Chain",
          nativeCurrency: { name: "Test ETH", symbol: "ETH", decimals: 18 },
          rpcUrls: [process.env.NEXT_PUBLIC_LOCAL_CHAIN_RPC ?? DEFAULT_LOCAL_RPC],
        }],
      });
    }
  }
  const accounts = await provider.request<string[]>({ method: "eth_requestAccounts" });
  if (!accounts[0]) throw new Error("Wallet returned no account.");
  return accounts[0];
}

export async function depositLocalWeth(
  account: string,
  amountWad: bigint,
  contractAddress: string,
  provider = injectedProvider(),
) {
  if (!provider) throw new Error("No injected EVM wallet was found.");
  return provider.request<Hex>({
    method: "eth_sendTransaction",
    params: [{
      from: account,
      to: contractAddress,
      data: encodeCall("deposit()"),
      value: toRpcHex(amountWad),
    }],
  });
}

export async function withdrawLocalWeth(
  account: string,
  amountWad: bigint,
  contractAddress: string,
  provider = injectedProvider(),
) {
  if (!provider) throw new Error("No injected EVM wallet was found.");
  return provider.request<Hex>({
    method: "eth_sendTransaction",
    params: [{
      from: account,
      to: contractAddress,
      data: encodeCall("withdrawWeth(uint256)", [encodeUint(amountWad)]),
    }],
  });
}

export async function withdrawLocalToken(
  account: string,
  tokenAmount: bigint,
  contractAddress: string,
  provider = injectedProvider(),
) {
  if (!provider) throw new Error("No injected EVM wallet was found.");
  return provider.request<Hex>({
    method: "eth_sendTransaction",
    params: [{
      from: account,
      to: contractAddress,
      data: encodeCall("withdrawToken(uint256)", [encodeUint(tokenAmount)]),
    }],
  });
}

export async function waitForReceipt(
  transactionHash: Hex,
  rpcUrl = DEFAULT_LOCAL_RPC,
  timeoutMs = 20_000,
) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const receipt = await rpcRequest<Record<string, unknown> | null>(rpcUrl, "eth_getTransactionReceipt", [transactionHash]);
    if (receipt) return receipt;
    await new Promise((resolve) => setTimeout(resolve, 80));
  }
  throw new Error("Timed out waiting for the local-chain transaction receipt.");
}

export async function commitLocalSettlement(
  sequencerAccount: string,
  settlement: SingleAccountSettlement,
  contractAddress: string,
  provider = injectedProvider(),
) {
  if (!provider) throw new Error("No injected EVM wallet was found.");
  return provider.request<Hex>({
    method: "eth_sendTransaction",
    params: [{
      from: sequencerAccount,
      to: contractAddress,
      data: encodeSingleAccountSettlement(settlement),
    }],
  });
}
