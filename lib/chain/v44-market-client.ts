import {
  decodeAddress,
  decodeBytes32,
  decodeInt,
  decodeUint,
  decodeWords,
  encodeAddress,
  encodeCall,
  encodeUint,
  fromWad,
  toRpcHex,
  toWad,
  type Hex,
} from "./abi.ts";
import { eventTopic, functionSelector } from "./keccak.ts";
import {
  DEFAULT_LOCAL_RPC,
  connectLocalWallet,
  ethCall,
  injectedProvider,
  rpcRequest,
  waitForReceipt,
  type Eip1193Provider,
} from "./local-battle-client.ts";

export const V44_EXECUTION_VERSION = "v44-terminal-contract-execution";
export const V43_TRADE_EVENT = "Trade(address,bool,uint256,uint256,uint256,uint256,uint256)";
export const V43_POSITION_OPENED_EVENT = "PositionOpened(uint256,address,uint8,uint16,uint256,uint256,uint256,uint256,uint256)";
export const V43_POSITION_CLOSED_EVENT = "PositionClosed(uint256,address,uint8,bool,uint256,int256,uint256,uint256)";
export const V43_STATE_COMMITTED_EVENT = "StateCommitted(uint64,bytes32,uint8,address,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256)";

export type V44RuntimeState = {
  sequence: number;
  timestamp: number;
  phase: number;
  marginalPriceWad: bigint;
  marketCapEthWad: bigint;
  realWethBalanceWei: bigint;
  freeWethWei: bigint;
  curveSoldTokenWad: bigint;
  curveTokenReserveWad: bigint;
  perpTokenReserveWad: bigint;
  safetyTokenReserveWad: bigint;
  lockedLongTokensWad: bigint;
  circulatingSpotTokensWad: bigint;
  borrowedShortTokensWad: bigint;
  openInterestLongWei: bigint;
  openInterestShortWei: bigint;
  activePositions: number;
  badDebtWei: bigint;
  lockedCollateralWei: bigint;
  lockedLongCollateralWei: bigint;
  lockedShortCollateralWei: bigint;
  lockedShortProceedsWei: bigint;
  syntheticLongCreditWei: bigint;
  cumulativeFeesWei: bigint;
  liquidationEquityWei: bigint;
  longCapacity2xWei: bigint;
  longCapacity5xWei: bigint;
  longCapacity10xWei: bigint;
  longCapacity20xWei: bigint;
  shortCapacityWei: bigint;
  stateHash: Hex;
  blockNumber: bigint;
  receivedAt: number;
};

export type V49SettlementQuote = {
  direction: "long" | "short";
  grossCurveWei: bigint;
  closeFeeWei: bigint;
  payoutWei: bigint;
  pnlWei: bigint;
  badDebtWei: bigint;
  postCloseObligationsWei: bigint;
  projectedBalanceWei: bigint;
  payableNow: boolean;
  liquidatable: boolean;
};

export type V50InvariantSnapshot = {
  accountedTokensWad: bigint;
  marketTokenCustodyWad: bigint;
  realWethBalanceWei: bigint;
  guaranteedObligationsWei: bigint;
  protectedWethWei: bigint;
  lockedCollateralWei: bigint;
  collateralSubledgerWei: bigint;
  shortInventoryWad: bigint;
  expectedShortInventoryWad: bigint;
  logicalTokenConservation: boolean;
  tokenCustodyMatches: boolean;
  collateralLedgerMatches: boolean;
  shortInventoryMatches: boolean;
  solvent: boolean;
};

export type V44ContractPosition = {
  id: bigint;
  owner: Hex;
  direction: "long" | "short";
  leverage: number;
  maintenanceMarginBps: number;
  openedAt: number;
  collateralWei: bigint;
  notionalWei: bigint;
  tokenAmountWad: bigint;
  debtWei: bigint;
  borrowedTokensWad: bigint;
  lockedProceedsWei: bigint;
  active: boolean;
};

export type V44TradeEvent = {
  trader: Hex;
  isBuy: boolean;
  grossWethWei: bigint;
  tokenAmountWad: bigint;
  feeWethWei: bigint;
  soldAfterWad: bigint;
  marketCapEthWad: bigint;
};

export type V44PositionOpenedEvent = {
  positionId: bigint;
  owner: Hex;
  direction: "long" | "short";
  leverage: number;
  collateralWei: bigint;
  notionalWei: bigint;
  tokenAmountWad: bigint;
  entryPriceWad: bigint;
  liquidationPriceWad: bigint;
};

export type V44PositionClosedEvent = {
  positionId: bigint;
  owner: Hex;
  direction: "long" | "short";
  liquidated: boolean;
  payoutWei: bigint;
  pnlWei: bigint;
  feeWei: bigint;
  badDebtWei: bigint;
};

export type V44ExecutionReceipt = {
  account: Hex;
  transactionHash: Hex;
  blockNumber: number;
  gasUsed: bigint;
  trade?: V44TradeEvent;
  opened?: V44PositionOpenedEvent;
  closed?: V44PositionClosedEvent;
  state?: V44RuntimeState;
};

type RpcLog = { address: Hex; topics: Hex[]; data: Hex };
type RpcReceipt = { blockNumber?: Hex; gasUsed?: Hex; logs?: RpcLog[]; status?: Hex; transactionHash?: Hex };

function assertAddress(address: string, label: string) {
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) throw new Error(`${label} address is invalid.`);
}

function addressFromTopic(topic?: string) {
  if (!topic) throw new Error("Indexed address topic is missing.");
  return `0x${topic.slice(-40)}` as Hex;
}

function uintFromTopic(topic?: string) {
  if (!topic) throw new Error("Indexed uint topic is missing.");
  return BigInt(topic);
}

function boolFromTopic(topic?: string) {
  return uintFromTopic(topic) !== 0n;
}

function signedWord(word: string) {
  const raw = decodeUint(word);
  const signBit = 1n << 255n;
  return raw & signBit ? raw - (1n << 256n) : raw;
}

function findEvent(receipt: RpcReceipt, signature: string) {
  const topic = eventTopic(signature).toLowerCase();
  return receipt.logs?.find((log) => log.topics[0]?.toLowerCase() === topic);
}

export function parseV44TradeEvent(receipt: RpcReceipt): V44TradeEvent | undefined {
  const log = findEvent(receipt, V43_TRADE_EVENT);
  if (!log) return undefined;
  const words = decodeWords(log.data);
  if (words.length < 5) throw new Error("Malformed V43 Trade event.");
  return {
    trader: addressFromTopic(log.topics[1]),
    isBuy: boolFromTopic(log.topics[2]),
    grossWethWei: decodeUint(words[0]),
    tokenAmountWad: decodeUint(words[1]),
    feeWethWei: decodeUint(words[2]),
    soldAfterWad: decodeUint(words[3]),
    marketCapEthWad: decodeUint(words[4]),
  };
}

export function parseV44PositionOpenedEvent(receipt: RpcReceipt): V44PositionOpenedEvent | undefined {
  const log = findEvent(receipt, V43_POSITION_OPENED_EVENT);
  if (!log) return undefined;
  const words = decodeWords(log.data);
  if (words.length < 6) throw new Error("Malformed V43 PositionOpened event.");
  return {
    positionId: uintFromTopic(log.topics[1]),
    owner: addressFromTopic(log.topics[2]),
    direction: uintFromTopic(log.topics[3]) === 0n ? "long" : "short",
    leverage: Number(decodeUint(words[0])),
    collateralWei: decodeUint(words[1]),
    notionalWei: decodeUint(words[2]),
    tokenAmountWad: decodeUint(words[3]),
    entryPriceWad: decodeUint(words[4]),
    liquidationPriceWad: decodeUint(words[5]),
  };
}

export function parseV44PositionClosedEvent(receipt: RpcReceipt): V44PositionClosedEvent | undefined {
  const log = findEvent(receipt, V43_POSITION_CLOSED_EVENT);
  if (!log) return undefined;
  const words = decodeWords(log.data);
  if (words.length < 5) throw new Error("Malformed V43 PositionClosed event.");
  return {
    positionId: uintFromTopic(log.topics[1]),
    owner: addressFromTopic(log.topics[2]),
    direction: uintFromTopic(log.topics[3]) === 0n ? "long" : "short",
    liquidated: decodeUint(words[0]) !== 0n,
    payoutWei: decodeUint(words[1]),
    pnlWei: signedWord(words[2]),
    feeWei: decodeUint(words[3]),
    badDebtWei: decodeUint(words[4]),
  };
}

export async function readV44RuntimeState(
  marketAddress: string,
  rpcUrl = process.env.NEXT_PUBLIC_LOCAL_CHAIN_RPC ?? DEFAULT_LOCAL_RPC,
): Promise<V44RuntimeState> {
  assertAddress(marketAddress, "Market");
  const readUint = async (signature: string, words: string[] = []) => {
    const result = await ethCall(rpcUrl, marketAddress, encodeCall(signature, words));
    return decodeUint(decodeWords(result)[0] ?? "0");
  };
  const [result, blockHex, lockedCollateralWei, lockedLongCollateralWei, lockedShortCollateralWei, lockedShortProceedsWei, syntheticLongCreditWei, cumulativeFeesWei, liquidationEquityWei, longCapacity2xWei, longCapacity5xWei, longCapacity10xWei, longCapacity20xWei, shortCapacityWei] = await Promise.all([
    ethCall(rpcUrl, marketAddress, encodeCall("runtimeState()")),
    rpcRequest<Hex>(rpcUrl, "eth_blockNumber"),
    readUint("lockedCollateralWei()"),
    readUint("lockedLongCollateralWei()"),
    readUint("lockedShortCollateralWei()"),
    readUint("lockedShortProceedsWei()"),
    readUint("syntheticLongCreditWei()"),
    readUint("cumulativeFeesWei()"),
    readUint("liquidationEquityWei()"),
    readUint("longNotionalCapacityWei(uint16)", [encodeUint(2)]),
    readUint("longNotionalCapacityWei(uint16)", [encodeUint(5)]),
    readUint("longNotionalCapacityWei(uint16)", [encodeUint(10)]),
    readUint("longNotionalCapacityWei(uint16)", [encodeUint(20)]),
    readUint("shortNotionalCapacityWei()"),
  ]);
  const words = decodeWords(result);
  if (words.length < 19) throw new Error(`Unexpected V43 runtimeState word count: ${words.length}.`);
  return {
    sequence: Number(decodeUint(words[0])),
    timestamp: Number(decodeUint(words[1])) * 1_000,
    phase: Number(decodeUint(words[2])),
    marginalPriceWad: decodeUint(words[3]),
    marketCapEthWad: decodeUint(words[4]),
    realWethBalanceWei: decodeUint(words[5]),
    freeWethWei: decodeUint(words[6]),
    curveSoldTokenWad: decodeUint(words[7]),
    curveTokenReserveWad: decodeUint(words[8]),
    perpTokenReserveWad: decodeUint(words[9]),
    safetyTokenReserveWad: decodeUint(words[10]),
    lockedLongTokensWad: decodeUint(words[11]),
    circulatingSpotTokensWad: decodeUint(words[12]),
    borrowedShortTokensWad: decodeUint(words[13]),
    openInterestLongWei: decodeUint(words[14]),
    openInterestShortWei: decodeUint(words[15]),
    activePositions: Number(decodeUint(words[16])),
    badDebtWei: decodeUint(words[17]),
    lockedCollateralWei,
    lockedLongCollateralWei,
    lockedShortCollateralWei,
    lockedShortProceedsWei,
    syntheticLongCreditWei,
    cumulativeFeesWei,
    liquidationEquityWei,
    longCapacity2xWei,
    longCapacity5xWei,
    longCapacity10xWei,
    longCapacity20xWei,
    shortCapacityWei,
    stateHash: decodeBytes32(words[18]),
    blockNumber: BigInt(blockHex),
    receivedAt: Date.now(),
  };
}

export async function readV44Position(
  marketAddress: string,
  positionId: bigint | number,
  rpcUrl = process.env.NEXT_PUBLIC_LOCAL_CHAIN_RPC ?? DEFAULT_LOCAL_RPC,
): Promise<V44ContractPosition> {
  assertAddress(marketAddress, "Market");
  const result = await ethCall(rpcUrl, marketAddress, encodeCall("position(uint256)", [encodeUint(positionId)]));
  const words = decodeWords(result);
  if (words.length < 13) throw new Error(`Unexpected V43 position word count: ${words.length}.`);
  return {
    id: decodeUint(words[0]),
    owner: decodeAddress(words[1]),
    direction: decodeUint(words[2]) === 0n ? "long" : "short",
    leverage: Number(decodeUint(words[3])),
    maintenanceMarginBps: Number(decodeUint(words[4])),
    openedAt: Number(decodeUint(words[5])) * 1_000,
    collateralWei: decodeUint(words[6]),
    notionalWei: decodeUint(words[7]),
    tokenAmountWad: decodeUint(words[8]),
    debtWei: decodeUint(words[9]),
    borrowedTokensWad: decodeUint(words[10]),
    lockedProceedsWei: decodeUint(words[11]),
    active: decodeUint(words[12]) !== 0n,
  };
}


export async function readV50InvariantSnapshot(
  marketAddress: string,
  rpcUrl = process.env.NEXT_PUBLIC_LOCAL_CHAIN_RPC ?? DEFAULT_LOCAL_RPC,
): Promise<V50InvariantSnapshot> {
  assertAddress(marketAddress, "Market");
  const result = await ethCall(rpcUrl, marketAddress, encodeCall("invariantSnapshot()"));
  const words = decodeWords(result);
  if (words.length < 14) throw new Error(`Unexpected V50 invariant snapshot word count: ${words.length}.`);
  return {
    accountedTokensWad: decodeUint(words[0]),
    marketTokenCustodyWad: decodeUint(words[1]),
    realWethBalanceWei: decodeUint(words[2]),
    guaranteedObligationsWei: decodeUint(words[3]),
    protectedWethWei: decodeUint(words[4]),
    lockedCollateralWei: decodeUint(words[5]),
    collateralSubledgerWei: decodeUint(words[6]),
    shortInventoryWad: decodeUint(words[7]),
    expectedShortInventoryWad: decodeUint(words[8]),
    logicalTokenConservation: decodeUint(words[9]) !== 0n,
    tokenCustodyMatches: decodeUint(words[10]) !== 0n,
    collateralLedgerMatches: decodeUint(words[11]) !== 0n,
    shortInventoryMatches: decodeUint(words[12]) !== 0n,
    solvent: decodeUint(words[13]) !== 0n,
  };
}

export async function readV49PositionSettlement(
  marketAddress: string,
  positionId: bigint | number,
  rpcUrl = process.env.NEXT_PUBLIC_LOCAL_CHAIN_RPC ?? DEFAULT_LOCAL_RPC,
): Promise<V49SettlementQuote> {
  assertAddress(marketAddress, "Market");
  const result = await ethCall(rpcUrl, marketAddress, encodeCall("quotePositionSettlement(uint256)", [encodeUint(positionId)]));
  const words = decodeWords(result);
  if (words.length < 10) throw new Error(`Unexpected V49 settlement quote word count: ${words.length}.`);
  return {
    direction: decodeUint(words[0]) === 0n ? "long" : "short",
    grossCurveWei: decodeUint(words[1]),
    closeFeeWei: decodeUint(words[2]),
    payoutWei: decodeUint(words[3]),
    pnlWei: decodeInt(words[4]),
    badDebtWei: decodeUint(words[5]),
    postCloseObligationsWei: decodeUint(words[6]),
    projectedBalanceWei: decodeUint(words[7]),
    payableNow: decodeUint(words[8]) !== 0n,
    liquidatable: decodeUint(words[9]) !== 0n,
  };
}

export async function readV49MaximumShortPayout(
  marketAddress: string,
  positionId: bigint | number,
  rpcUrl = process.env.NEXT_PUBLIC_LOCAL_CHAIN_RPC ?? DEFAULT_LOCAL_RPC,
) {
  assertAddress(marketAddress, "Market");
  const result = await ethCall(rpcUrl, marketAddress, encodeCall("quoteMaximumShortPayoutWei(uint256)", [encodeUint(positionId)]));
  return decodeUint(decodeWords(result)[0] ?? "0");
}

export async function readV44PositionEquity(
  marketAddress: string,
  positionId: bigint | number,
  rpcUrl = process.env.NEXT_PUBLIC_LOCAL_CHAIN_RPC ?? DEFAULT_LOCAL_RPC,
) {
  assertAddress(marketAddress, "Market");
  const result = await ethCall(rpcUrl, marketAddress, encodeCall("quotePositionEquityWei(uint256)", [encodeUint(positionId)]));
  return decodeUint(decodeWords(result)[0] ?? "0");
}

export async function readV44ActivePositionIds(
  marketAddress: string,
  rpcUrl = process.env.NEXT_PUBLIC_LOCAL_CHAIN_RPC ?? DEFAULT_LOCAL_RPC,
) {
  assertAddress(marketAddress, "Market");
  const result = await ethCall(rpcUrl, marketAddress, encodeCall("activePositionIds()"));
  const words = decodeWords(result);
  if (words.length < 2) return [] as bigint[];
  const offset = Number(decodeUint(words[0]) / 32n);
  const length = Number(decodeUint(words[offset] ?? "0"));
  return words.slice(offset + 1, offset + 1 + length).map(decodeUint);
}

export async function readV44TokenBalance(
  tokenAddress: string,
  account: string,
  rpcUrl = process.env.NEXT_PUBLIC_LOCAL_CHAIN_RPC ?? DEFAULT_LOCAL_RPC,
) {
  assertAddress(tokenAddress, "Token");
  assertAddress(account, "Account");
  const result = await ethCall(rpcUrl, tokenAddress, encodeCall("balanceOf(address)", [encodeAddress(account)]));
  return decodeUint(decodeWords(result)[0] ?? "0");
}

export async function readV44WalletBalance(
  account: string,
  rpcUrl = process.env.NEXT_PUBLIC_LOCAL_CHAIN_RPC ?? DEFAULT_LOCAL_RPC,
) {
  assertAddress(account, "Account");
  return BigInt(await rpcRequest<Hex>(rpcUrl, "eth_getBalance", [account, "latest"]));
}

async function readAllowance(tokenAddress: string, owner: string, spender: string, rpcUrl: string) {
  const result = await ethCall(rpcUrl, tokenAddress, encodeCall("allowance(address,address)", [encodeAddress(owner), encodeAddress(spender)]));
  return decodeUint(decodeWords(result)[0] ?? "0");
}

async function sendAndReconcile(
  account: Hex,
  marketAddress: string,
  transactionHash: Hex,
  rpcUrl: string,
): Promise<V44ExecutionReceipt> {
  const receipt = await waitForReceipt(transactionHash, rpcUrl, 45_000) as RpcReceipt;
  if (receipt.status === "0x0") throw new Error(`V43 transaction reverted: ${transactionHash}`);
  const state = await readV44RuntimeState(marketAddress, rpcUrl);
  return {
    account,
    transactionHash,
    blockNumber: receipt.blockNumber ? Number(BigInt(receipt.blockNumber)) : Number(state.blockNumber),
    gasUsed: receipt.gasUsed ? BigInt(receipt.gasUsed) : 0n,
    trade: parseV44TradeEvent(receipt),
    opened: parseV44PositionOpenedEvent(receipt),
    closed: parseV44PositionClosedEvent(receipt),
    state,
  };
}

async function walletAndAccount(provider: Eip1193Provider | null) {
  if (!provider) throw new Error("No injected EVM wallet was found.");
  const account = await connectLocalWallet(provider);
  return { provider, account: account as Hex };
}

export async function executeV44SpotBuy(
  marketAddress: string,
  amountEth: number,
  provider: Eip1193Provider | null = injectedProvider(),
  rpcUrl = process.env.NEXT_PUBLIC_LOCAL_CHAIN_RPC ?? DEFAULT_LOCAL_RPC,
) {
  assertAddress(marketAddress, "Market");
  const { account, provider: wallet } = await walletAndAccount(provider);
  const transactionHash = await wallet.request<Hex>({
    method: "eth_sendTransaction",
    params: [{ from: account, to: marketAddress, data: functionSelector("buy()"), value: toRpcHex(toWad(amountEth)) }],
  });
  return sendAndReconcile(account, marketAddress, transactionHash, rpcUrl);
}

export async function executeV44SpotSell(
  marketAddress: string,
  tokenAddress: string,
  tokenAmountWad: bigint,
  provider: Eip1193Provider | null = injectedProvider(),
  rpcUrl = process.env.NEXT_PUBLIC_LOCAL_CHAIN_RPC ?? DEFAULT_LOCAL_RPC,
) {
  assertAddress(marketAddress, "Market");
  assertAddress(tokenAddress, "Token");
  if (tokenAmountWad <= 0n) throw new Error("Spot sell token amount must be greater than zero.");
  const { account, provider: wallet } = await walletAndAccount(provider);
  const allowance = await readAllowance(tokenAddress, account, marketAddress, rpcUrl);
  if (allowance < tokenAmountWad) {
    const approvalHash = await wallet.request<Hex>({
      method: "eth_sendTransaction",
      params: [{ from: account, to: tokenAddress, data: encodeCall("approve(address,uint256)", [encodeAddress(marketAddress), encodeUint(tokenAmountWad)]) }],
    });
    const approvalReceipt = await waitForReceipt(approvalHash, rpcUrl, 45_000) as RpcReceipt;
    if (approvalReceipt.status === "0x0") throw new Error("Token approval reverted.");
  }
  const transactionHash = await wallet.request<Hex>({
    method: "eth_sendTransaction",
    params: [{ from: account, to: marketAddress, data: encodeCall("sell(uint256)", [encodeUint(tokenAmountWad)]) }],
  });
  return sendAndReconcile(account, marketAddress, transactionHash, rpcUrl);
}

async function quoteOpenValue(
  marketAddress: string,
  direction: "long" | "short",
  collateralWei: bigint,
  leverage: number,
  rpcUrl: string,
) {
  const signature = direction === "long" ? "quoteOpenLong(uint256,uint16)" : "quoteOpenShort(uint256,uint16)";
  const result = await ethCall(rpcUrl, marketAddress, encodeCall(signature, [encodeUint(collateralWei), encodeUint(leverage)]));
  const words = decodeWords(result);
  if (words.length < 3) throw new Error(`${signature} returned an invalid quote.`);
  return { notionalWei: decodeUint(words[0]), feeWei: decodeUint(words[1]), totalRequiredWei: decodeUint(words[2]) };
}

export async function executeV44OpenPosition(
  marketAddress: string,
  direction: "long" | "short",
  leverage: number,
  collateralEth: number,
  maintenanceMarginBps = 200,
  provider: Eip1193Provider | null = injectedProvider(),
  rpcUrl = process.env.NEXT_PUBLIC_LOCAL_CHAIN_RPC ?? DEFAULT_LOCAL_RPC,
) {
  assertAddress(marketAddress, "Market");
  const { account, provider: wallet } = await walletAndAccount(provider);
  const collateralWei = toWad(collateralEth);
  const quote = await quoteOpenValue(marketAddress, direction, collateralWei, leverage, rpcUrl);
  const signature = direction === "long" ? "openLong(uint16,uint16,uint256)" : "openShort(uint16,uint16,uint256)";
  const transactionHash = await wallet.request<Hex>({
    method: "eth_sendTransaction",
    params: [{
      from: account,
      to: marketAddress,
      data: encodeCall(signature, [encodeUint(leverage), encodeUint(maintenanceMarginBps), encodeUint(collateralWei)]),
      value: toRpcHex(quote.totalRequiredWei),
    }],
  });
  return sendAndReconcile(account, marketAddress, transactionHash, rpcUrl);
}

export async function executeV44ClosePosition(
  marketAddress: string,
  positionId: bigint | number,
  provider: Eip1193Provider | null = injectedProvider(),
  rpcUrl = process.env.NEXT_PUBLIC_LOCAL_CHAIN_RPC ?? DEFAULT_LOCAL_RPC,
) {
  assertAddress(marketAddress, "Market");
  const { account, provider: wallet } = await walletAndAccount(provider);
  const transactionHash = await wallet.request<Hex>({
    method: "eth_sendTransaction",
    params: [{ from: account, to: marketAddress, data: encodeCall("closePosition(uint256)", [encodeUint(positionId)]) }],
  });
  return sendAndReconcile(account, marketAddress, transactionHash, rpcUrl);
}

export function runtimeStateToTokenPatch(state: V44RuntimeState, ethUsd = 3_200) {
  const priceEth = fromWad(state.marginalPriceWad, 18);
  const marketCapEth = fromWad(state.marketCapEthWad, 18);
  const realWeth = fromWad(state.realWethBalanceWei, 18);
  const freeWeth = fromWad(state.freeWethWei, 18);
  const longOi = fromWad(state.openInterestLongWei, 18);
  const shortOi = fromWad(state.openInterestShortWei, 18);
  const totalOi = longOi + shortOi;
  return {
    price: priceEth * ethUsd,
    cap: marketCapEth * ethUsd,
    indexCap: marketCapEth * ethUsd,
    markCap: marketCapEth * ethUsd,
    realWethBalance: realWeth,
    liquidityEth: realWeth,
    freeWethEth: freeWeth,
    insuranceEth: freeWeth,
    curveTokenReserve: fromWad(state.curveTokenReserveWad, 18),
    curveRealTokenReserve: fromWad(state.curveTokenReserveWad, 18),
    curveWethReserve: realWeth,
    perpTokenReserve: fromWad(state.perpTokenReserveWad, 18),
    safetyTokenReserve: fromWad(state.safetyTokenReserveWad, 18),
    lockedLongTokens: fromWad(state.lockedLongTokensWad, 18),
    circulatingSpotTokens: fromWad(state.circulatingSpotTokensWad, 18),
    borrowedShortTokens: fromWad(state.borrowedShortTokensWad, 18),
    longOpenInterestEth: longOi,
    shortOpenInterestEth: shortOi,
    openInterest: totalOi * ethUsd,
    longs: totalOi > 0 ? longOi / totalOi * 100 : 50,
    badDebtEth: fromWad(state.badDebtWei, 18),
    lockedCollateralEth: fromWad(state.lockedCollateralWei, 18),
    lockedLongCollateralEth: fromWad(state.lockedLongCollateralWei, 18),
    lockedShortCollateralEth: fromWad(state.lockedShortCollateralWei, 18),
    lockedShortProceedsEth: fromWad(state.lockedShortProceedsWei, 18),
    syntheticLongCreditEth: fromWad(state.syntheticLongCreditWei, 18),
    poolFeesEth: fromWad(state.cumulativeFeesWei, 18),
    liquidationEquityEth: fromWad(state.liquidationEquityWei, 18),
    chainLongCapacity2xEth: fromWad(state.longCapacity2xWei, 18),
    chainLongCapacity5xEth: fromWad(state.longCapacity5xWei, 18),
    chainLongCapacity10xEth: fromWad(state.longCapacity10xWei, 18),
    chainLongCapacity20xEth: fromWad(state.longCapacity20xWei, 18),
    shortCapacityEth: fromWad(state.shortCapacityWei, 18),
    battlePhase: (["bonding", "migrating", "migrated", "paused"] as const)[state.phase] ?? "paused",
    launchState: state.phase === 2 ? "graduated" as const : "live" as const,
    chainStateSequence: state.sequence,
    chainStateHash: state.stateHash,
    chainLastBlock: Number(state.blockNumber),
    chainLastSyncedAt: state.receivedAt,
    chainExecutionVersion: V44_EXECUTION_VERSION,
    activeChainPositions: state.activePositions,
    battlePoolVersion: "v43-unified-contract",
  };
}
