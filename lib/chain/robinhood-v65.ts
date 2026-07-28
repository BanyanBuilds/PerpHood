import {
  decodeAddress,
  decodeInt,
  decodeUint,
  decodeWords,
  encodeAddress,
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
import { ensureRobinhoodNetwork, readRobinhoodWalletBalance, ROBINHOOD_NETWORKS, type RobinhoodNetwork, type RobinhoodNetworkKey } from "./robinhood-v54.ts";

export const V65_WETH = "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73" as Hex;
export const V65_UNISWAP_V3_FACTORY = "0x1f7d7550b1b028f7571e69a784071f0205fd2efa" as Hex;
export const V65_POSITION_MANAGER = "0x73991a25c818bf1f1128deaab1492d45638de0d3" as Hex;
export const V65_SWAP_ROUTER_02 = "0xcaf681a66d020601342297493863e78c959e5cb2" as Hex;
export const V65_QUOTER_V2 = "0x33e885ed0ec9bf04ecfb19341582aadcb4c8a9e7" as Hex;
export const V65_CANONICAL_POOL_FEE = 10_000;
export const V65_TOTAL_SUPPLY_WAD = 1_000_000_000n * 10n ** 18n;
export const V65_OPENING_FDV_ETH_WAD = 250_000_000_000_000_000n;
export const V65_TARGET_FDV_ETH_WAD = 22_500_000_000_000_000_000n;
export const V65_MIN_TOTAL_LAUNCH_BUDGET_WEI = 1_000_000_000_000_000n;
export const V65_TOKEN_LAUNCHED_EVENT = "TokenLaunched(address,address,address,address,address,address,address,uint256,uint24,bool,uint256,uint256,uint256,bytes32)";
export const V65_CANONICAL_POOL_EVENT = "CanonicalPoolCreated(address,address,address,address,address,address,uint24,uint256,bool,int24,int24)";

const MAINNET_CANARY_CREATOR = process.env.NEXT_PUBLIC_LEVERAGEX_CANARY_CREATOR_ADDRESS?.trim().toLowerCase() ?? "";

export type V65LaunchInput = {
  name: string;
  symbol: string;
  metadataURI: string;
  metadataHash: Hex;
};

export type V65LaunchBudget = {
  totalBudgetWei: bigint;
  gasEstimate: bigint;
  gasLimit: bigint;
  gasPriceWei: bigint;
  maximumGasCostWei: bigint;
  creatorBuyWei: bigint;
};

export type V65LaunchReceipt = {
  network: RobinhoodNetworkKey;
  chainId: number;
  account: Hex;
  transactionHash: Hex;
  blockNumber: number;
  factoryAddress: Hex;
  marketAddress: Hex;
  poolAddress: Hex;
  tokenAddress: Hex;
  creatorAddress: Hex;
  dexFactory: Hex;
  pairToken: Hex;
  positionManager: Hex;
  liquidityLocker: Hex;
  launchPositionId: bigint;
  poolFee: number;
  tokenIsToken0: boolean;
  creatorBuyWei: bigint;
  creatorTokensOutWad: bigint;
  supplyWad: bigint;
  marketCapEthWad: bigint;
  targetFdvEthWad: bigint;
  metadataHash: Hex;
  budget: V65LaunchBudget;
  explorerTransactionUrl: string;
  explorerTokenUrl: string;
  explorerMarketUrl: string;
};

export type V65ExecutionOptions = {
  slippageBps?: number;
  maxNetworkFeeEth?: number;
  maxPriceImpactPercent?: number;
  onQuote?: (quote: { priceImpactPercent: number; minimumOutputWei: bigint; maximumNetworkFeeEth?: number }) => void;
  onWalletRequest?: () => void;
  onSubmitted?: (transactionHash: Hex) => void;
};

export type V65SpotTradeReceipt = {
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
  unwrapTransactionHash?: Hex;
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

function normalizeAddress(value: string, label: string): Hex {
  if (!/^0x[0-9a-fA-F]{40}$/.test(value)) throw new Error(`${label} is not configured with a valid EVM address.`);
  return value.toLowerCase() as Hex;
}

function addressFromTopic(topic?: string): Hex {
  if (!topic) throw new Error("The receipt is missing an indexed address.");
  return `0x${stripHex(topic).slice(-40)}`.toLowerCase() as Hex;
}

function boolFromWord(word: string) {
  return decodeUint(word) !== 0n;
}

export function encodeV65CreateToken(input: V65LaunchInput) {
  const nameTail = encodeDynamicString(input.name);
  const symbolTail = encodeDynamicString(input.symbol);
  const uriTail = encodeDynamicString(input.metadataURI);
  const headBytes = 4 * 32;
  const symbolOffset = headBytes + nameTail.length / 2;
  const uriOffset = symbolOffset + symbolTail.length / 2;
  return `${functionSelector("createToken(string,string,string,bytes32)")}${encodeUint(headBytes)}${encodeUint(symbolOffset)}${encodeUint(uriOffset)}${encodeBytes32(input.metadataHash)}${nameTail}${symbolTail}${uriTail}` as Hex;
}

function enforceMainnetCanary(account: Hex, networkKey: RobinhoodNetworkKey) {
  if (networkKey !== "mainnet" || !/^0x[0-9a-f]{40}$/.test(MAINNET_CANARY_CREATOR)) return;
  if (account !== MAINNET_CANARY_CREATOR) {
    throw new Error(`Mainnet canary launching is restricted to ${MAINNET_CANARY_CREATOR.slice(0, 8)}…${MAINNET_CANARY_CREATOR.slice(-6)}.`);
  }
}

async function estimateBudget(
  input: V65LaunchInput,
  account: Hex,
  factoryAddress: Hex,
  network: RobinhoodNetwork,
  provider: Eip1193Provider,
  requestedTotalBudgetWei: bigint,
): Promise<V65LaunchBudget> {
  if (requestedTotalBudgetWei < V65_MIN_TOTAL_LAUNCH_BUDGET_WEI) throw new Error("Total launch spend must be at least 0.001 ETH including gas.");
  const data = encodeV65CreateToken(input);
  const gasPriceWei = BigInt(await provider.request<Hex>({ method: "eth_gasPrice" }));
  let creatorBuyWei = requestedTotalBudgetWei / 2n;
  let gasEstimate = 0n;
  let gasLimit = 0n;
  let maximumGasCostWei = 0n;
  for (let pass = 0; pass < 3; pass += 1) {
    gasEstimate = BigInt(await provider.request<Hex>({
      method: "eth_estimateGas",
      params: [{ from: account, to: factoryAddress, data, value: toRpcHex(creatorBuyWei) }],
    }));
    gasLimit = gasEstimate * 130n / 100n + 20_000n;
    maximumGasCostWei = gasLimit * gasPriceWei;
    if (maximumGasCostWei >= requestedTotalBudgetWei) throw new Error(`Current ${network.name} gas is too expensive for the selected total launch spend.`);
    creatorBuyWei = requestedTotalBudgetWei - maximumGasCostWei;
  }
  if (creatorBuyWei < 1_000_000_000_000n) throw new Error("The estimated gas reserve leaves too little ETH for the creator genesis buy.");
  return { totalBudgetWei: requestedTotalBudgetWei, gasEstimate, gasLimit, gasPriceWei, maximumGasCostWei, creatorBuyWei };
}

export async function quoteV65LaunchBudget(
  input: V65LaunchInput,
  networkKey: RobinhoodNetworkKey = "mainnet",
  provider: Eip1193Provider | null = injectedProvider(),
  requestedTotalBudgetEth: number | string = "0.001",
) {
  if (!provider) throw new Error("No injected EVM wallet was found.");
  const { account, network } = await ensureRobinhoodNetwork(networkKey, provider, requestedTotalBudgetEth);
  enforceMainnetCanary(account, networkKey);
  const factoryAddress = normalizeAddress(network.factoryAddress, `${network.name} Leverage X V65 factory`);
  const requestedTotalBudgetWei = toWad(requestedTotalBudgetEth);
  const budget = await estimateBudget(input, account, factoryAddress, network, provider, requestedTotalBudgetWei);
  const walletBalance = await readRobinhoodWalletBalance(account, networkKey, provider);
  if (walletBalance < budget.totalBudgetWei) throw new Error(`Wallet needs at least ${fromWad(budget.totalBudgetWei, 18)} ETH for this launch.`);
  return { account, network, factoryAddress, walletBalance, budget };
}

export function parseV65TokenLaunched(receipt: TransactionReceipt) {
  const topic = eventTopic(V65_TOKEN_LAUNCHED_EVENT).toLowerCase();
  const log = receipt.logs?.find((entry) => entry.topics[0]?.toLowerCase() === topic);
  if (!log) throw new Error("The confirmed transaction did not emit the Leverage X V65 TokenLaunched event.");
  const words = decodeWords(log.data);
  if (words.length < 11) throw new Error("The Leverage X V65 TokenLaunched payload is malformed.");
  return {
    tokenAddress: addressFromTopic(log.topics[1]),
    creatorAddress: addressFromTopic(log.topics[2]),
    dexFactory: addressFromTopic(log.topics[3]),
    pairToken: decodeAddress(words[0]).toLowerCase() as Hex,
    poolAddress: decodeAddress(words[1]).toLowerCase() as Hex,
    positionManager: decodeAddress(words[2]).toLowerCase() as Hex,
    liquidityLocker: decodeAddress(words[3]).toLowerCase() as Hex,
    launchPositionId: decodeUint(words[4]),
    poolFee: Number(decodeUint(words[5])),
    tokenIsToken0: boolFromWord(words[6]),
    initialBuyAmount: decodeUint(words[7]),
    initialTokensOut: decodeUint(words[8]),
    supply: decodeUint(words[9]),
    metadataHash: `0x${words[10]}`.toLowerCase() as Hex,
  };
}

export async function launchV65Token(
  input: V65LaunchInput,
  networkKey: RobinhoodNetworkKey = "mainnet",
  provider: Eip1193Provider | null = injectedProvider(),
  requestedTotalBudgetEth: number | string = "0.001",
): Promise<V65LaunchReceipt> {
  if (!provider) throw new Error("No injected EVM wallet was found.");
  const { account, network, factoryAddress, budget } = await quoteV65LaunchBudget(input, networkKey, provider, requestedTotalBudgetEth);
  const transactionHash = await provider.request<Hex>({
    method: "eth_sendTransaction",
    params: [{ from: account, to: factoryAddress, data: encodeV65CreateToken(input), value: toRpcHex(budget.creatorBuyWei), gas: toRpcHex(budget.gasLimit), gasPrice: toRpcHex(budget.gasPriceWei) }],
  });
  const receipt = await waitForReceipt(transactionHash, network.rpcUrl, 180_000) as TransactionReceipt;
  if (receipt.status === "0x0" || !receipt.blockNumber) throw new Error("The Leverage X V65 launch transaction reverted.");
  const launched = parseV65TokenLaunched(receipt);
  if (launched.creatorAddress !== account || launched.metadataHash !== input.metadataHash.toLowerCase()) throw new Error("The canonical launch event does not match the signed launch request.");
  const runtime = await readV65PoolRuntime(launched.poolAddress, launched.tokenAddress, networkKey);
  const marketCapEthWad = toWad(Math.max(0, runtime.marketCapEth).toFixed(18));
  return {
    network: networkKey,
    chainId: network.chainId,
    account,
    transactionHash,
    blockNumber: Number(BigInt(receipt.blockNumber)),
    factoryAddress,
    marketAddress: launched.poolAddress,
    poolAddress: launched.poolAddress,
    tokenAddress: launched.tokenAddress,
    creatorAddress: launched.creatorAddress,
    dexFactory: launched.dexFactory,
    pairToken: launched.pairToken,
    positionManager: launched.positionManager,
    liquidityLocker: launched.liquidityLocker,
    launchPositionId: launched.launchPositionId,
    poolFee: launched.poolFee,
    tokenIsToken0: launched.tokenIsToken0,
    creatorBuyWei: launched.initialBuyAmount,
    creatorTokensOutWad: launched.initialTokensOut,
    supplyWad: launched.supply,
    marketCapEthWad,
    targetFdvEthWad: V65_TARGET_FDV_ETH_WAD,
    metadataHash: launched.metadataHash,
    budget,
    explorerTransactionUrl: `${network.explorerUrl}/tx/${transactionHash}`,
    explorerTokenUrl: `${network.explorerUrl}/address/${launched.tokenAddress}`,
    explorerMarketUrl: `${network.explorerUrl}/address/${launched.poolAddress}`,
  };
}

async function ethCall(network: RobinhoodNetwork, to: string, data: Hex) {
  return rpcRequest<Hex>(network.rpcUrl, "eth_call", [{ to, data }, "latest"]);
}

export async function readV65TokenBalance(tokenAddress: string, account: string, networkKey: RobinhoodNetworkKey) {
  const network = ROBINHOOD_NETWORKS[networkKey];
  const token = normalizeAddress(tokenAddress, "V65 token");
  const owner = normalizeAddress(account, "Wallet account");
  const result = await ethCall(network, token, `${functionSelector("balanceOf(address)")}${encodeAddress(owner)}` as Hex);
  return decodeUint(decodeWords(result)[0] ?? "0");
}

async function readErc20Balance(tokenAddress: string, account: string, networkKey: RobinhoodNetworkKey) {
  return readV65TokenBalance(tokenAddress, account, networkKey);
}

function priceWadFromSqrt(sqrtPriceX96: bigint, tokenIsToken0: boolean) {
  const q192 = 1n << 192n;
  const square = sqrtPriceX96 * sqrtPriceX96;
  if (square === 0n) return 0n;
  return tokenIsToken0 ? square * 10n ** 18n / q192 : q192 * 10n ** 18n / square;
}

export async function readV65PoolRuntime(poolAddress: string, tokenAddress: string, networkKey: RobinhoodNetworkKey) {
  const network = ROBINHOOD_NETWORKS[networkKey];
  const pool = normalizeAddress(poolAddress, "V65 canonical pool");
  const token = normalizeAddress(tokenAddress, "V65 token");
  const [slot0Raw, token0Raw, tokenBalance, wethBalance] = await Promise.all([
    ethCall(network, pool, functionSelector("slot0()")),
    ethCall(network, pool, functionSelector("token0()")),
    readErc20Balance(token, pool, networkKey),
    readErc20Balance(V65_WETH, pool, networkKey),
  ]);
  const slotWords = decodeWords(slot0Raw);
  const token0 = decodeAddress(decodeWords(token0Raw)[0] ?? "0").toLowerCase();
  const tokenIsToken0 = token0 === token;
  const sqrtPriceX96 = decodeUint(slotWords[0] ?? "0");
  const tick = Number(decodeInt(slotWords[1] ?? "0"));
  const priceWad = priceWadFromSqrt(sqrtPriceX96, tokenIsToken0);
  const priceEth = fromWad(priceWad, 18);
  const marketCapEth = priceEth * 1_000_000_000;
  const poolTokens = fromWad(tokenBalance, 18);
  const soldTokens = Math.max(0, 800_000_000 - poolTokens);
  return {
    pool,
    token,
    tokenIsToken0,
    sqrtPriceX96,
    tick,
    priceWad,
    priceEth,
    marketCapEth,
    realEthBalance: fromWad(wethBalance, 18),
    poolTokenBalance: poolTokens,
    soldTokens,
    feesEth: 0,
    tradeCount: 0,
    paused: false,
  };
}

function encodeQuoterExactInput(tokenIn: Hex, tokenOut: Hex, amountIn: bigint) {
  return `${functionSelector("quoteExactInputSingle((address,address,uint256,uint24,uint160))")}${encodeAddress(tokenIn)}${encodeAddress(tokenOut)}${encodeUint(amountIn)}${encodeUint(V65_CANONICAL_POOL_FEE)}${encodeUint(0)}` as Hex;
}

async function quoteExactInput(tokenIn: Hex, tokenOut: Hex, amountIn: bigint, networkKey: RobinhoodNetworkKey) {
  const network = ROBINHOOD_NETWORKS[networkKey];
  const result = await ethCall(network, V65_QUOTER_V2, encodeQuoterExactInput(tokenIn, tokenOut, amountIn));
  const words = decodeWords(result);
  if (!words[0]) throw new Error("Uniswap V3 QuoterV2 returned no executable output.");
  return decodeUint(words[0]);
}

export async function quoteV65SpotBuy(poolAddress: string, tokenAddress: string, amountEth: number, networkKey: RobinhoodNetworkKey) {
  const amountWei = toWad(amountEth);
  const token = normalizeAddress(tokenAddress, "V65 token");
  const [tokenOutWad, runtime] = await Promise.all([
    quoteExactInput(V65_WETH, token, amountWei, networkKey),
    readV65PoolRuntime(poolAddress, token, networkKey),
  ]);
  const executionPrice = tokenOutWad > 0n ? fromWad(amountWei * 10n ** 18n / tokenOutWad, 18) : 0;
  const priceImpactPercent = runtime.priceEth > 0 ? Math.abs(executionPrice - runtime.priceEth) / runtime.priceEth * 100 : 0;
  return { amountWei, tokenOutWad, executionPrice, priceImpactPercent, runtime };
}

export async function quoteV65SpotSell(poolAddress: string, tokenAddress: string, tokenAmountWad: bigint, networkKey: RobinhoodNetworkKey) {
  const token = normalizeAddress(tokenAddress, "V65 token");
  const [wethOutWei, runtime] = await Promise.all([
    quoteExactInput(token, V65_WETH, tokenAmountWad, networkKey),
    readV65PoolRuntime(poolAddress, token, networkKey),
  ]);
  const executionPrice = tokenAmountWad > 0n ? fromWad(wethOutWei * 10n ** 18n / tokenAmountWad, 18) : 0;
  const priceImpactPercent = runtime.priceEth > 0 ? Math.abs(executionPrice - runtime.priceEth) / runtime.priceEth * 100 : 0;
  return { tokenAmountWad, wethOutWei, executionPrice, priceImpactPercent, runtime };
}

function encodeRouterExactInput(tokenIn: Hex, tokenOut: Hex, recipient: Hex, amountIn: bigint, amountOutMinimum: bigint) {
  return `${functionSelector("exactInputSingle((address,address,uint24,address,uint256,uint256,uint160))")}${encodeAddress(tokenIn)}${encodeAddress(tokenOut)}${encodeUint(V65_CANONICAL_POOL_FEE)}${encodeAddress(recipient)}${encodeUint(amountIn)}${encodeUint(amountOutMinimum)}${encodeUint(0)}` as Hex;
}

async function transactionWithFeeCeiling(provider: Eip1193Provider, transaction: Record<string, unknown>, maxNetworkFeeEth?: number) {
  const gasEstimate = BigInt(await provider.request<Hex>({ method: "eth_estimateGas", params: [transaction] }));
  const gasPriceWei = BigInt(await provider.request<Hex>({ method: "eth_gasPrice" }));
  const gasLimit = gasEstimate * 125n / 100n + 8_000n;
  const maximumNetworkFeeWei = gasLimit * gasPriceWei;
  if (maxNetworkFeeEth !== undefined && maxNetworkFeeEth > 0 && maximumNetworkFeeWei > toWad(maxNetworkFeeEth)) {
    throw new Error(`Estimated network fee ${fromWad(maximumNetworkFeeWei, 8)} ETH exceeds the selected ${maxNetworkFeeEth.toFixed(8)} ETH ceiling.`);
  }
  return { ...transaction, gas: toRpcHex(gasLimit), gasPrice: toRpcHex(gasPriceWei) };
}

export async function executeV65SpotBuy(
  poolAddress: string,
  tokenAddress: string,
  amountEth: number,
  networkKey: RobinhoodNetworkKey,
  options: V65ExecutionOptions = {},
  provider: Eip1193Provider | null = injectedProvider(),
): Promise<V65SpotTradeReceipt> {
  if (!provider) throw new Error("No injected EVM wallet was found.");
  const { account, network } = await ensureRobinhoodNetwork(networkKey, provider);
  const pool = normalizeAddress(poolAddress, "V65 canonical pool");
  const token = normalizeAddress(tokenAddress, "V65 token");
  const quote = await quoteV65SpotBuy(pool, token, amountEth, networkKey);
  if (options.maxPriceImpactPercent !== undefined && quote.priceImpactPercent > options.maxPriceImpactPercent) throw new Error(`Quoted price impact ${quote.priceImpactPercent.toFixed(2)}% exceeds your ${options.maxPriceImpactPercent.toFixed(2)}% ceiling.`);
  const slippageBps = Math.max(1, Math.min(9_900, Math.round(options.slippageBps ?? 200)));
  const minimumOut = quote.tokenOutWad * BigInt(10_000 - slippageBps) / 10_000n;
  options.onQuote?.({ priceImpactPercent: quote.priceImpactPercent, minimumOutputWei: minimumOut, maximumNetworkFeeEth: options.maxNetworkFeeEth });
  const before = await readV65TokenBalance(token, account, networkKey);
  const transaction = await transactionWithFeeCeiling(provider, {
    from: account,
    to: V65_SWAP_ROUTER_02,
    value: toRpcHex(quote.amountWei),
    data: encodeRouterExactInput(V65_WETH, token, account, quote.amountWei, minimumOut),
  }, options.maxNetworkFeeEth);
  options.onWalletRequest?.();
  const transactionHash = await provider.request<Hex>({ method: "eth_sendTransaction", params: [transaction] });
  options.onSubmitted?.(transactionHash);
  const receipt = await waitForReceipt(transactionHash, network.rpcUrl, 180_000) as TransactionReceipt;
  if (receipt.status === "0x0" || !receipt.blockNumber) throw new Error("The Uniswap V3 Spot buy reverted.");
  const after = await readV65TokenBalance(token, account, networkKey);
  const tokenAmountWad = after - before;
  if (tokenAmountWad <= 0n) throw new Error("The buy confirmed but no token balance increase was detected.");
  const runtime = await readV65PoolRuntime(pool, token, networkKey);
  return {
    network: networkKey,
    account,
    transactionHash,
    blockNumber: Number(BigInt(receipt.blockNumber)),
    marketAddress: pool,
    tokenAddress: token,
    isBuy: true,
    grossEthWei: quote.amountWei,
    tokenAmountWad,
    feeEthWei: quote.amountWei * BigInt(V65_CANONICAL_POOL_FEE) / 1_000_000n,
    soldAfterWad: toWad(runtime.soldTokens.toFixed(18)),
    marginalPriceWad: tokenAmountWad > 0n ? quote.amountWei * 10n ** 18n / tokenAmountWad : 0n,
    marketCapEthWad: toWad(Math.max(0, runtime.marketCapEth).toFixed(18)),
    netEthWei: 0n,
  };
}

export async function executeV65SpotSell(
  poolAddress: string,
  tokenAddress: string,
  tokenAmountWad: bigint,
  networkKey: RobinhoodNetworkKey,
  options: V65ExecutionOptions = {},
  provider: Eip1193Provider | null = injectedProvider(),
): Promise<V65SpotTradeReceipt> {
  if (!provider) throw new Error("No injected EVM wallet was found.");
  const { account, network } = await ensureRobinhoodNetwork(networkKey, provider);
  const pool = normalizeAddress(poolAddress, "V65 canonical pool");
  const token = normalizeAddress(tokenAddress, "V65 token");
  const available = await readV65TokenBalance(token, account, networkKey);
  if (tokenAmountWad <= 0n || tokenAmountWad > available) throw new Error("Wallet does not hold enough of this token.");
  const quote = await quoteV65SpotSell(pool, token, tokenAmountWad, networkKey);
  if (options.maxPriceImpactPercent !== undefined && quote.priceImpactPercent > options.maxPriceImpactPercent) throw new Error(`Quoted sell impact ${quote.priceImpactPercent.toFixed(2)}% exceeds your ${options.maxPriceImpactPercent.toFixed(2)}% ceiling.`);
  const slippageBps = Math.max(1, Math.min(9_900, Math.round(options.slippageBps ?? 200)));
  const minimumOut = quote.wethOutWei * BigInt(10_000 - slippageBps) / 10_000n;
  options.onQuote?.({ priceImpactPercent: quote.priceImpactPercent, minimumOutputWei: minimumOut, maximumNetworkFeeEth: options.maxNetworkFeeEth });

  const approval = await transactionWithFeeCeiling(provider, {
    from: account,
    to: token,
    data: `${functionSelector("approve(address,uint256)")}${encodeAddress(V65_SWAP_ROUTER_02)}${encodeUint(tokenAmountWad)}` as Hex,
  }, options.maxNetworkFeeEth);
  options.onWalletRequest?.();
  const approvalTransactionHash = await provider.request<Hex>({ method: "eth_sendTransaction", params: [approval] });
  const approvalReceipt = await waitForReceipt(approvalTransactionHash, network.rpcUrl, 180_000) as TransactionReceipt;
  if (approvalReceipt.status === "0x0") throw new Error("Token approval reverted.");

  const wethBefore = await readErc20Balance(V65_WETH, account, networkKey);
  const sell = await transactionWithFeeCeiling(provider, {
    from: account,
    to: V65_SWAP_ROUTER_02,
    data: encodeRouterExactInput(token, V65_WETH, account, tokenAmountWad, minimumOut),
  }, options.maxNetworkFeeEth);
  const transactionHash = await provider.request<Hex>({ method: "eth_sendTransaction", params: [sell] });
  options.onSubmitted?.(transactionHash);
  const receipt = await waitForReceipt(transactionHash, network.rpcUrl, 180_000) as TransactionReceipt;
  if (receipt.status === "0x0" || !receipt.blockNumber) throw new Error("The Uniswap V3 Spot sell reverted.");
  const wethAfter = await readErc20Balance(V65_WETH, account, networkKey);
  const wethOut = wethAfter - wethBefore;
  if (wethOut <= 0n) throw new Error("The sell confirmed but no WETH output was detected.");

  const unwrap = await transactionWithFeeCeiling(provider, {
    from: account,
    to: V65_WETH,
    data: `${functionSelector("withdraw(uint256)")}${encodeUint(wethOut)}` as Hex,
  }, options.maxNetworkFeeEth);
  const unwrapTransactionHash = await provider.request<Hex>({ method: "eth_sendTransaction", params: [unwrap] });
  const unwrapReceipt = await waitForReceipt(unwrapTransactionHash, network.rpcUrl, 180_000) as TransactionReceipt;
  if (unwrapReceipt.status === "0x0") throw new Error("The WETH-to-ETH unwrap reverted.");

  const runtime = await readV65PoolRuntime(pool, token, networkKey);
  return {
    network: networkKey,
    account,
    transactionHash,
    blockNumber: Number(BigInt(receipt.blockNumber)),
    marketAddress: pool,
    tokenAddress: token,
    isBuy: false,
    grossEthWei: wethOut,
    tokenAmountWad,
    feeEthWei: 0n,
    soldAfterWad: toWad(runtime.soldTokens.toFixed(18)),
    marginalPriceWad: tokenAmountWad > 0n ? wethOut * 10n ** 18n / tokenAmountWad : 0n,
    marketCapEthWad: toWad(Math.max(0, runtime.marketCapEth).toFixed(18)),
    netEthWei: wethOut,
    approvalTransactionHash,
    unwrapTransactionHash,
  };
}
