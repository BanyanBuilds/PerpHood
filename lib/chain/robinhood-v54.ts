import {
  decodeAddress,
  decodeUint,
  decodeWords,
  encodeBytes32,
  encodeUint,
  fromWad,
  stripHex,
  toRpcHex,
  toWad,
  type Hex,
} from "./abi.ts";
import { eventTopic, functionSelector } from "./keccak.ts";
import { injectedProvider, rpcRequest, waitForReceipt, type Eip1193Provider } from "./local-battle-client.ts";

export type RobinhoodNetworkKey = "testnet" | "mainnet";

export type RobinhoodNetwork = {
  key: RobinhoodNetworkKey;
  name: string;
  chainId: number;
  chainHex: Hex;
  rpcUrl: string;
  explorerUrl: string;
  factoryAddress: string;
};

const TESTNET_RPC = process.env.NEXT_PUBLIC_ROBINHOOD_TESTNET_RPC_URL ?? "https://rpc.testnet.chain.robinhood.com";
const MAINNET_RPC = process.env.NEXT_PUBLIC_ROBINHOOD_MAINNET_RPC_URL ?? "https://rpc.mainnet.chain.robinhood.com";

export const ROBINHOOD_NETWORKS: Record<RobinhoodNetworkKey, RobinhoodNetwork> = {
  testnet: {
    key: "testnet",
    name: "Robinhood Chain Testnet",
    chainId: 46_630,
    chainHex: "0xb626",
    rpcUrl: TESTNET_RPC,
    explorerUrl: "https://explorer.testnet.chain.robinhood.com",
    factoryAddress: process.env.NEXT_PUBLIC_V54_TESTNET_FACTORY_ADDRESS ?? "",
  },
  mainnet: {
    key: "mainnet",
    name: "Robinhood Chain",
    chainId: 4_663,
    chainHex: "0x1237",
    rpcUrl: MAINNET_RPC,
    explorerUrl: "https://robinhoodchain.blockscout.com",
    factoryAddress: process.env.NEXT_PUBLIC_V54_MAINNET_FACTORY_ADDRESS ?? "",
  },
};

export const V54_TOTAL_LAUNCH_BUDGET_WEI = 1_000_000_000_000_000n; // 0.001 ETH inclusive of the configured gas ceiling.
export const V54_MARKET_CREATED_EVENT = "MarketCreated(address,address,address,uint256,uint256,uint256,uint256,bytes32)";

export type V54LaunchInput = {
  name: string;
  symbol: string;
  metadataURI: string;
  metadataHash: Hex;
  migrationTargetMarketCapUsd: number;
};

export type V54LaunchBudget = {
  totalBudgetWei: bigint;
  gasEstimate: bigint;
  gasLimit: bigint;
  gasPriceWei: bigint;
  maximumGasCostWei: bigint;
  creatorBuyWei: bigint;
};

export type V54LaunchReceipt = {
  network: RobinhoodNetworkKey;
  chainId: number;
  account: Hex;
  transactionHash: Hex;
  blockNumber: number;
  factoryAddress: Hex;
  marketAddress: Hex;
  tokenAddress: Hex;
  creatorAddress: Hex;
  creatorBuyWei: bigint;
  creatorTokensOutWad: bigint;
  marketCapEthWad: bigint;
  migrationTargetUsdWad: bigint;
  metadataHash: Hex;
  budget: V54LaunchBudget;
  explorerTransactionUrl: string;
  explorerTokenUrl: string;
  explorerMarketUrl: string;
};

type RpcLog = { address: Hex; topics: Hex[]; data: Hex };
type TransactionReceipt = { blockNumber?: Hex; logs?: RpcLog[]; status?: Hex };

function utf8Hex(value: string) {
  return Array.from(new TextEncoder().encode(value), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function padRightWord(hex: string) {
  const remainder = hex.length % 64;
  return remainder === 0 ? hex : hex.padEnd(hex.length + 64 - remainder, "0");
}

function encodeDynamicString(value: string) {
  const hex = utf8Hex(value);
  return `${encodeUint(hex.length / 2)}${padRightWord(hex)}`;
}

export function encodeV54CreateMarket(input: V54LaunchInput) {
  const nameTail = encodeDynamicString(input.name);
  const symbolTail = encodeDynamicString(input.symbol);
  const uriTail = encodeDynamicString(input.metadataURI);
  const headBytes = 5 * 32;
  const symbolOffset = headBytes + nameTail.length / 2;
  const uriOffset = symbolOffset + symbolTail.length / 2;
  const targetUsdWad = BigInt(Math.round(input.migrationTargetMarketCapUsd)) * 10n ** 18n;
  return `${functionSelector("createMarket(string,string,string,bytes32,uint256)")}${encodeUint(headBytes)}${encodeUint(symbolOffset)}${encodeUint(uriOffset)}${encodeBytes32(input.metadataHash)}${encodeUint(targetUsdWad)}${nameTail}${symbolTail}${uriTail}` as Hex;
}

function normalizeAddress(value: string, label: string): Hex {
  if (!/^0x[0-9a-fA-F]{40}$/.test(value)) throw new Error(`${label} is not configured with a valid EVM address.`);
  return value.toLowerCase() as Hex;
}

function addressFromTopic(topic?: string): Hex {
  if (!topic) throw new Error("The launch receipt is missing an indexed address.");
  return `0x${stripHex(topic).slice(-40)}`.toLowerCase() as Hex;
}

export async function ensureRobinhoodNetwork(
  networkKey: RobinhoodNetworkKey,
  provider: Eip1193Provider | null = injectedProvider(),
) {
  if (!provider) throw new Error("No injected EVM wallet was found. Install or open an EVM browser wallet first.");
  const network = ROBINHOOD_NETWORKS[networkKey];
  const current = await provider.request<string>({ method: "eth_chainId" });
  if (current.toLowerCase() !== network.chainHex) {
    try {
      await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: network.chainHex }] });
    } catch {
      await provider.request({
        method: "wallet_addEthereumChain",
        params: [{
          chainId: network.chainHex,
          chainName: network.name,
          nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
          rpcUrls: [network.rpcUrl],
          blockExplorerUrls: [network.explorerUrl],
        }],
      });
    }
  }
  const accounts = await provider.request<string[]>({ method: "eth_requestAccounts" });
  if (!accounts[0]) throw new Error("Wallet returned no account.");
  const account = normalizeAddress(accounts[0], "Wallet account");
  return { account, network };
}

export async function readRobinhoodWalletBalance(
  account: string,
  networkKey: RobinhoodNetworkKey,
  provider: Eip1193Provider | null = injectedProvider(),
) {
  const network = ROBINHOOD_NETWORKS[networkKey];
  const normalized = normalizeAddress(account, "Wallet account");
  const value = provider
    ? await provider.request<Hex>({ method: "eth_getBalance", params: [normalized, "latest"] })
    : await rpcRequest<Hex>(network.rpcUrl, "eth_getBalance", [normalized, "latest"]);
  return BigInt(value);
}

async function estimateBudget(
  input: V54LaunchInput,
  account: Hex,
  factoryAddress: Hex,
  network: RobinhoodNetwork,
  provider: Eip1193Provider,
): Promise<V54LaunchBudget> {
  const data = encodeV54CreateMarket(input);
  const gasPriceHex = await provider.request<Hex>({ method: "eth_gasPrice" });
  const gasPriceWei = BigInt(gasPriceHex);
  let creatorBuyWei = V54_TOTAL_LAUNCH_BUDGET_WEI / 2n;
  let gasEstimate = 0n;
  let gasLimit = 0n;
  let maximumGasCostWei = 0n;

  for (let pass = 0; pass < 2; pass += 1) {
    const estimateHex = await provider.request<Hex>({
      method: "eth_estimateGas",
      params: [{ from: account, to: factoryAddress, data, value: toRpcHex(creatorBuyWei) }],
    });
    gasEstimate = BigInt(estimateHex);
    gasLimit = gasEstimate * 125n / 100n + 12_000n;
    maximumGasCostWei = gasLimit * gasPriceWei;
    if (maximumGasCostWei >= V54_TOTAL_LAUNCH_BUDGET_WEI) {
      throw new Error(`Current ${network.name} gas is too expensive for the 0.001 ETH total launch budget.`);
    }
    creatorBuyWei = V54_TOTAL_LAUNCH_BUDGET_WEI - maximumGasCostWei;
  }

  if (creatorBuyWei < 1_000_000_000_000n) {
    throw new Error("The estimated gas reserve leaves too little ETH for a valid creator genesis buy.");
  }
  return { totalBudgetWei: V54_TOTAL_LAUNCH_BUDGET_WEI, gasEstimate, gasLimit, gasPriceWei, maximumGasCostWei, creatorBuyWei };
}

export async function quoteV54LaunchBudget(
  input: V54LaunchInput,
  networkKey: RobinhoodNetworkKey = "testnet",
  provider: Eip1193Provider | null = injectedProvider(),
) {
  if (!provider) throw new Error("No injected EVM wallet was found.");
  const { account, network } = await ensureRobinhoodNetwork(networkKey, provider);
  const factoryAddress = normalizeAddress(network.factoryAddress, `${network.name} V54 factory`);
  const budget = await estimateBudget(input, account, factoryAddress, network, provider);
  const walletBalance = await readRobinhoodWalletBalance(account, networkKey, provider);
  if (walletBalance < budget.totalBudgetWei) throw new Error("Wallet needs at least 0.001 ETH on this network for the capped launch transaction.");
  return { account, network, factoryAddress, walletBalance, budget };
}

export function parseV54MarketCreated(receipt: TransactionReceipt) {
  const topic = eventTopic(V54_MARKET_CREATED_EVENT).toLowerCase();
  const log = receipt.logs?.find((entry) => entry.topics[0]?.toLowerCase() === topic);
  if (!log) throw new Error("The confirmed transaction did not emit the PERPHOOD V54 MarketCreated event.");
  const words = decodeWords(log.data);
  if (words.length < 5) throw new Error("The MarketCreated event payload is malformed.");
  return {
    marketAddress: addressFromTopic(log.topics[1]),
    tokenAddress: addressFromTopic(log.topics[2]),
    creatorAddress: addressFromTopic(log.topics[3]),
    creatorBuyWei: decodeUint(words[0]),
    creatorTokensOutWad: decodeUint(words[1]),
    marketCapEthWad: decodeUint(words[2]),
    migrationTargetUsdWad: decodeUint(words[3]),
    metadataHash: `0x${words[4]}` as Hex,
  };
}

export async function launchV54Market(
  input: V54LaunchInput,
  networkKey: RobinhoodNetworkKey = "testnet",
  provider: Eip1193Provider | null = injectedProvider(),
): Promise<V54LaunchReceipt> {
  if (!provider) throw new Error("No injected EVM wallet was found.");
  const quoted = await quoteV54LaunchBudget(input, networkKey, provider);
  const data = encodeV54CreateMarket(input);
  const transactionHash = await provider.request<Hex>({
    method: "eth_sendTransaction",
    params: [{
      from: quoted.account,
      to: quoted.factoryAddress,
      data,
      value: toRpcHex(quoted.budget.creatorBuyWei),
      gas: toRpcHex(quoted.budget.gasLimit),
      gasPrice: toRpcHex(quoted.budget.gasPriceWei),
    }],
  });
  const rawReceipt = await waitForReceipt(transactionHash, quoted.network.rpcUrl, 120_000) as TransactionReceipt;
  if (rawReceipt.status === "0x0") throw new Error("The Robinhood Chain launch transaction reverted.");
  if (!rawReceipt.blockNumber) throw new Error("The launch receipt did not include a block number.");
  const created = parseV54MarketCreated(rawReceipt);
  const blockNumber = Number(BigInt(rawReceipt.blockNumber));
  return {
    network: networkKey,
    chainId: quoted.network.chainId,
    account: quoted.account,
    transactionHash,
    blockNumber,
    factoryAddress: quoted.factoryAddress,
    ...created,
    budget: quoted.budget,
    explorerTransactionUrl: `${quoted.network.explorerUrl}/tx/${transactionHash}`,
    explorerTokenUrl: `${quoted.network.explorerUrl}/address/${created.tokenAddress}`,
    explorerMarketUrl: `${quoted.network.explorerUrl}/address/${created.marketAddress}`,
  };
}

export async function readV54MarketRuntime(
  marketAddress: string,
  networkKey: RobinhoodNetworkKey = "testnet",
) {
  const network = ROBINHOOD_NETWORKS[networkKey];
  const market = normalizeAddress(marketAddress, "V54 market");
  const result = await rpcRequest<Hex>(network.rpcUrl, "eth_call", [{ to: market, data: functionSelector("runtimeState()") }, "latest"]);
  const words = decodeWords(result);
  if (words.length < 8) throw new Error("V54 market runtimeState response is malformed.");
  return {
    priceEth: fromWad(decodeUint(words[0]), 18),
    marketCapEth: fromWad(decodeUint(words[1]), 18),
    soldTokens: fromWad(decodeUint(words[2]), 6),
    marketTokenBalance: fromWad(decodeUint(words[3]), 6),
    realEthBalance: fromWad(decodeUint(words[4]), 18),
    feesEth: fromWad(decodeUint(words[5]), 18),
    tradeCount: Number(decodeUint(words[6])),
    paused: decodeUint(words[7]) === 1n,
  };
}

export function formatEthWei(value: bigint, precision = 6) {
  return `${fromWad(value, precision).toFixed(precision).replace(/0+$/, "").replace(/\.$/, "")} ETH`;
}

export function toMetadataHash(value: string): Hex {
  const normalized = value.toLowerCase();
  if (!/^0x[0-9a-f]{64}$/.test(normalized)) throw new Error("Metadata hash must be bytes32.");
  return normalized as Hex;
}

export function creatorBuyEthFromBudget(budget: V54LaunchBudget) {
  return fromWad(budget.creatorBuyWei, 18);
}

export function totalBudgetEth() {
  return fromWad(V54_TOTAL_LAUNCH_BUDGET_WEI, 18);
}

export function parseEthAmount(value: number | string) {
  return toWad(value);
}

export type V54SpotTradeReceipt = {
  network: RobinhoodNetworkKey;
  account: Hex;
  transactionHash: Hex;
  blockNumber: number;
  marketAddress: Hex;
  tokenAddress: Hex;
  isBuy: boolean;
  grossEthWei: bigint;
  tokenAmountWad: bigint;
  feeEthWei: bigint;
  soldAfterWad: bigint;
  marginalPriceWad: bigint;
  marketCapEthWad: bigint;
  netEthWei: bigint;
  approvalTransactionHash?: Hex;
};

const V54_TRADE_EVENT = "Trade(address,bool,uint256,uint256,uint256,uint256,uint256,uint256)";

function parseV54Trade(receipt: TransactionReceipt) {
  const topic = eventTopic(V54_TRADE_EVENT).toLowerCase();
  const log = receipt.logs?.find((entry) => entry.topics[0]?.toLowerCase() === topic);
  if (!log) throw new Error("The confirmed market transaction emitted no V54 Trade event.");
  const words = decodeWords(log.data);
  if (words.length < 6) throw new Error("The V54 Trade event payload is malformed.");
  return {
    trader: addressFromTopic(log.topics[1]),
    isBuy: decodeUint(stripHex(log.topics[2] ?? "0x0").padStart(64, "0")) === 1n,
    grossEthWei: decodeUint(words[0]),
    tokenAmountWad: decodeUint(words[1]),
    feeEthWei: decodeUint(words[2]),
    soldAfterWad: decodeUint(words[3]),
    marginalPriceWad: decodeUint(words[4]),
    marketCapEthWad: decodeUint(words[5]),
  };
}

export async function quoteV54SpotBuy(
  marketAddress: string,
  amountEth: number,
  networkKey: RobinhoodNetworkKey,
) {
  const network = ROBINHOOD_NETWORKS[networkKey];
  const market = normalizeAddress(marketAddress, "V54 market");
  const amountWei = toWad(amountEth);
  const result = await rpcRequest<Hex>(network.rpcUrl, "eth_call", [{
    to: market,
    data: `${functionSelector("quoteBuy(uint256)")}${encodeUint(amountWei)}`,
  }, "latest"]);
  const words = decodeWords(result);
  if (words.length < 8) throw new Error("V54 buy quote response is malformed.");
  return {
    amountWei,
    tokenOutWad: decodeUint(words[2]),
    feeEthWei: decodeUint(words[4]),
    priceAfterWad: decodeUint(words[7]),
  };
}

export async function quoteV54SpotSell(
  marketAddress: string,
  tokenAmountWad: bigint,
  networkKey: RobinhoodNetworkKey,
) {
  const network = ROBINHOOD_NETWORKS[networkKey];
  const market = normalizeAddress(marketAddress, "V54 market");
  const result = await rpcRequest<Hex>(network.rpcUrl, "eth_call", [{
    to: market,
    data: `${functionSelector("quoteSell(uint256)")}${encodeUint(tokenAmountWad)}`,
  }, "latest"]);
  const words = decodeWords(result);
  if (words.length < 8) throw new Error("V54 sell quote response is malformed.");
  return {
    tokenAmountWad,
    grossEthWei: decodeUint(words[3]),
    feeEthWei: decodeUint(words[4]),
    netEthWei: decodeUint(words[5]),
    priceAfterWad: decodeUint(words[7]),
  };
}

export async function readV54TokenBalance(
  tokenAddress: string,
  account: string,
  networkKey: RobinhoodNetworkKey,
) {
  const network = ROBINHOOD_NETWORKS[networkKey];
  const token = normalizeAddress(tokenAddress, "V54 token");
  const owner = normalizeAddress(account, "Wallet account");
  const result = await rpcRequest<Hex>(network.rpcUrl, "eth_call", [{
    to: token,
    data: `${functionSelector("balanceOf(address)")}${stripHex(owner).padStart(64, "0")}`,
  }, "latest"]);
  return decodeUint(decodeWords(result)[0] ?? "0");
}

export async function executeV54SpotBuy(
  marketAddress: string,
  tokenAddress: string,
  amountEth: number,
  networkKey: RobinhoodNetworkKey,
  slippageBps = 200,
  provider: Eip1193Provider | null = injectedProvider(),
): Promise<V54SpotTradeReceipt> {
  if (!provider) throw new Error("No injected EVM wallet was found.");
  const { account, network } = await ensureRobinhoodNetwork(networkKey, provider);
  const market = normalizeAddress(marketAddress, "V54 market");
  const token = normalizeAddress(tokenAddress, "V54 token");
  const quote = await quoteV54SpotBuy(market, amountEth, networkKey);
  const minTokenOut = quote.tokenOutWad * BigInt(10_000 - slippageBps) / 10_000n;
  const transactionHash = await provider.request<Hex>({
    method: "eth_sendTransaction",
    params: [{
      from: account,
      to: market,
      value: toRpcHex(quote.amountWei),
      data: `${functionSelector("buy(uint256)")}${encodeUint(minTokenOut)}`,
    }],
  });
  const receipt = await waitForReceipt(transactionHash, network.rpcUrl, 120_000) as TransactionReceipt;
  if (receipt.status === "0x0" || !receipt.blockNumber) throw new Error("The V54 spot buy reverted.");
  const trade = parseV54Trade(receipt);
  return {
    network: networkKey,
    account,
    transactionHash,
    blockNumber: Number(BigInt(receipt.blockNumber)),
    marketAddress: market,
    tokenAddress: token,
    ...trade,
    netEthWei: 0n,
  };
}

export async function executeV54SpotSell(
  marketAddress: string,
  tokenAddress: string,
  tokenAmountWad: bigint,
  networkKey: RobinhoodNetworkKey,
  slippageBps = 200,
  provider: Eip1193Provider | null = injectedProvider(),
): Promise<V54SpotTradeReceipt> {
  if (!provider) throw new Error("No injected EVM wallet was found.");
  const { account, network } = await ensureRobinhoodNetwork(networkKey, provider);
  const market = normalizeAddress(marketAddress, "V54 market");
  const token = normalizeAddress(tokenAddress, "V54 token");
  const available = await readV54TokenBalance(token, account, networkKey);
  if (tokenAmountWad <= 0n || tokenAmountWad > available) throw new Error("Wallet does not hold enough of this token.");
  const quote = await quoteV54SpotSell(market, tokenAmountWad, networkKey);
  const minEthOut = quote.netEthWei * BigInt(10_000 - slippageBps) / 10_000n;
  const approvalTransactionHash = await provider.request<Hex>({
    method: "eth_sendTransaction",
    params: [{
      from: account,
      to: token,
      data: `${functionSelector("approve(address,uint256)")}${stripHex(market).padStart(64, "0")}${encodeUint(tokenAmountWad)}`,
    }],
  });
  const approvalReceipt = await waitForReceipt(approvalTransactionHash, network.rpcUrl, 120_000) as TransactionReceipt;
  if (approvalReceipt.status === "0x0") throw new Error("Token approval reverted.");
  const transactionHash = await provider.request<Hex>({
    method: "eth_sendTransaction",
    params: [{
      from: account,
      to: market,
      data: `${functionSelector("sell(uint256,uint256)")}${encodeUint(tokenAmountWad)}${encodeUint(minEthOut)}`,
    }],
  });
  const receipt = await waitForReceipt(transactionHash, network.rpcUrl, 120_000) as TransactionReceipt;
  if (receipt.status === "0x0" || !receipt.blockNumber) throw new Error("The V54 spot sell reverted.");
  const trade = parseV54Trade(receipt);
  return {
    network: networkKey,
    account,
    transactionHash,
    blockNumber: Number(BigInt(receipt.blockNumber)),
    marketAddress: market,
    tokenAddress: token,
    ...trade,
    netEthWei: trade.grossEthWei - trade.feeEthWei,
    approvalTransactionHash,
  };
}
