import {
  decodeAddress,
  decodeBytes32,
  decodeUint,
  decodeWords,
  encodeAddress,
  encodeBytes32,
  encodeCall,
  encodeUint,
  toRpcHex,
  type Hex,
} from "./abi.ts";
import {
  DEFAULT_LOCAL_RPC,
  connectLocalWallet,
  ethCall,
  injectedProvider,
  waitForReceipt,
  type Eip1193Provider,
} from "./local-battle-client.ts";
import type { V45SignedTradingIntent } from "./v45-session-key.ts";

export const V45_EXECUTION_VERSION = "v45-authorized-account-execution";
export const V45_ROUTER_ADDRESS_ENV = "NEXT_PUBLIC_V45_ACCOUNT_ROUTER_ADDRESS";

export type V45AccountState = {
  accountWethWei: bigint;
  accountTokenWad: bigint;
  routerEthWei: bigint;
  routerTokenWad: bigint;
  wethLiabilityWei: bigint;
  tokenLiabilityWad: bigint;
  solvent: boolean;
};

export type V45SessionState = {
  owner: Hex;
  publicKeyHash: Hex;
  validUntil: number;
  nextNonce: number;
  maxNotionalWei: bigint;
  maxCumulativeNotionalWei: bigint;
  spentNotionalWei: bigint;
  actionBitmap: bigint;
  active: boolean;
};

export type V45RelayResult = {
  ok: true;
  finalized: true;
  action: number;
  actionLabel: string;
  account: Hex;
  market: Hex;
  transactionHash: Hex;
  blockNumber: number;
  gasUsed: string;
  relayLatencyMs: number;
  chainFinalityMs: number;
  accountState: {
    accountWethWei: string;
    accountTokenWad: string;
    routerEthWei: string;
    routerTokenWad: string;
    wethLiabilityWei: string;
    tokenLiabilityWad: string;
    solvent: boolean;
  };
  trade?: {
    trader: Hex;
    isBuy: boolean;
    grossWethWei: string;
    tokenAmountWad: string;
    feeWethWei: string;
    soldAfterWad: string;
    marketCapEthWad: string;
  };
  opened?: {
    positionId: string;
    owner: Hex;
    direction: "long" | "short";
    leverage: number;
    collateralWei: string;
    notionalWei: string;
    tokenAmountWad: string;
    entryPriceWad: string;
    liquidationPriceWad: string;
  };
  closed?: {
    positionId: string;
    owner: Hex;
    direction: "long" | "short";
    liquidated: boolean;
    payoutWei: string;
    pnlWei: string;
    feeWei: string;
    badDebtWei: string;
  };
};

function assertAddress(value: string, label: string) {
  if (!/^0x[0-9a-fA-F]{40}$/.test(value)) throw new Error(`${label} address is invalid.`);
}

export function configuredV45RouterAddress() {
  const value = process.env.NEXT_PUBLIC_V45_ACCOUNT_ROUTER_ADDRESS;
  return value && /^0x[0-9a-fA-F]{40}$/.test(value) ? value as Hex : null;
}

export async function readV45AccountState(
  account: string,
  market: string,
  router = configuredV45RouterAddress(),
  rpcUrl = process.env.NEXT_PUBLIC_LOCAL_CHAIN_RPC ?? DEFAULT_LOCAL_RPC,
): Promise<V45AccountState> {
  if (!router) throw new Error("V45 account router is not configured.");
  assertAddress(account, "Account");
  assertAddress(market, "Market");
  const result = await ethCall(rpcUrl, router, encodeCall("accountState(address,address)", [encodeAddress(account), encodeAddress(market)]));
  const words = decodeWords(result);
  if (words.length < 7) throw new Error("Malformed V45 accountState response.");
  return {
    accountWethWei: decodeUint(words[0]),
    accountTokenWad: decodeUint(words[1]),
    routerEthWei: decodeUint(words[2]),
    routerTokenWad: decodeUint(words[3]),
    wethLiabilityWei: decodeUint(words[4]),
    tokenLiabilityWad: decodeUint(words[5]),
    solvent: decodeUint(words[6]) === 1n,
  };
}

export async function readV45SessionState(
  sessionId: Hex,
  router = configuredV45RouterAddress(),
  rpcUrl = process.env.NEXT_PUBLIC_LOCAL_CHAIN_RPC ?? DEFAULT_LOCAL_RPC,
): Promise<V45SessionState> {
  if (!router) throw new Error("V45 account router is not configured.");
  const result = await ethCall(rpcUrl, router, encodeCall("sessionState(bytes32)", [encodeBytes32(sessionId)]));
  const words = decodeWords(result);
  if (words.length < 9) throw new Error("Malformed V45 sessionState response.");
  return {
    owner: decodeAddress(words[0]),
    publicKeyHash: decodeBytes32(words[1]),
    validUntil: Number(decodeUint(words[2])),
    nextNonce: Number(decodeUint(words[3])),
    maxNotionalWei: decodeUint(words[4]),
    maxCumulativeNotionalWei: decodeUint(words[5]),
    spentNotionalWei: decodeUint(words[6]),
    actionBitmap: decodeUint(words[7]),
    active: decodeUint(words[8]) === 1n,
  };
}

async function walletAndAccount(provider: Eip1193Provider | null) {
  if (!provider) throw new Error("No injected EVM wallet was found.");
  return { provider, account: await connectLocalWallet(provider) as Hex };
}

export async function depositV45Account(
  amountWei: bigint,
  router = configuredV45RouterAddress(),
  provider: Eip1193Provider | null = injectedProvider(),
  rpcUrl = process.env.NEXT_PUBLIC_LOCAL_CHAIN_RPC ?? DEFAULT_LOCAL_RPC,
) {
  if (!router) throw new Error("V45 account router is not configured.");
  if (amountWei <= 0n) throw new Error("Deposit amount must be positive.");
  const { account, provider: wallet } = await walletAndAccount(provider);
  const transactionHash = await wallet.request<Hex>({
    method: "eth_sendTransaction",
    params: [{ from: account, to: router, data: encodeCall("deposit()"), value: toRpcHex(amountWei) }],
  });
  const receipt = await waitForReceipt(transactionHash, rpcUrl, 45_000);
  return { account, transactionHash, receipt };
}

export async function withdrawV45Account(
  amountWei: bigint,
  router = configuredV45RouterAddress(),
  provider: Eip1193Provider | null = injectedProvider(),
  rpcUrl = process.env.NEXT_PUBLIC_LOCAL_CHAIN_RPC ?? DEFAULT_LOCAL_RPC,
) {
  if (!router) throw new Error("V45 account router is not configured.");
  if (amountWei <= 0n) throw new Error("Withdrawal amount must be positive.");
  const { account, provider: wallet } = await walletAndAccount(provider);
  const transactionHash = await wallet.request<Hex>({
    method: "eth_sendTransaction",
    params: [{ from: account, to: router, data: encodeCall("withdraw(uint256)", [encodeUint(amountWei)]) }],
  });
  const receipt = await waitForReceipt(transactionHash, rpcUrl, 45_000);
  return { account, transactionHash, receipt };
}

export async function authorizeV45Session(input: {
  sessionId: Hex;
  publicKeyHash: Hex;
  validUntil: number;
  maxNotionalWei: bigint;
  maxCumulativeNotionalWei: bigint;
  actionBitmap: bigint;
  router?: Hex | null;
  provider?: Eip1193Provider | null;
  rpcUrl?: string;
}) {
  const router = input.router ?? configuredV45RouterAddress();
  if (!router) throw new Error("V45 account router is not configured.");
  const { account, provider: wallet } = await walletAndAccount(input.provider ?? injectedProvider());
  const transactionHash = await wallet.request<Hex>({
    method: "eth_sendTransaction",
    params: [{
      from: account,
      to: router,
      data: encodeCall("authorizeSession(bytes32,bytes32,uint64,uint256,uint256,uint256)", [
        encodeBytes32(input.sessionId),
        encodeBytes32(input.publicKeyHash),
        encodeUint(input.validUntil),
        encodeUint(input.maxNotionalWei),
        encodeUint(input.maxCumulativeNotionalWei),
        encodeUint(input.actionBitmap),
      ]),
    }],
  });
  const receipt = await waitForReceipt(transactionHash, input.rpcUrl ?? process.env.NEXT_PUBLIC_LOCAL_CHAIN_RPC ?? DEFAULT_LOCAL_RPC, 45_000);
  return { account, transactionHash, receipt };
}

export async function revokeV45Session(
  sessionId: Hex,
  router = configuredV45RouterAddress(),
  provider: Eip1193Provider | null = injectedProvider(),
  rpcUrl = process.env.NEXT_PUBLIC_LOCAL_CHAIN_RPC ?? DEFAULT_LOCAL_RPC,
) {
  if (!router) throw new Error("V45 account router is not configured.");
  const { account, provider: wallet } = await walletAndAccount(provider);
  const transactionHash = await wallet.request<Hex>({
    method: "eth_sendTransaction",
    params: [{ from: account, to: router, data: encodeCall("revokeSession(bytes32)", [encodeBytes32(sessionId)]) }],
  });
  const receipt = await waitForReceipt(transactionHash, rpcUrl, 45_000);
  return { account, transactionHash, receipt };
}

export async function relayV45Intent(signedIntent: V45SignedTradingIntent) {
  const response = await fetch("/api/v45/relay", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ signedIntent }),
  });
  const payload = await response.json() as Partial<V45RelayResult> & { error?: string };
  if (!response.ok || !payload.ok || !payload.transactionHash) throw new Error(payload.error ?? "V45 relay rejected the intent.");
  return payload as V45RelayResult;
}
