import { decodeUint, decodeWords, encodeAddress, encodeCall, encodeUint, toWad, type Hex } from "./abi.ts";
import { DEFAULT_LOCAL_RPC, connectLocalWallet, injectedProvider, rpcRequest, waitForReceipt } from "./local-battle-client.ts";
import {
  configuredV45RouterAddress,
  readV45AccountState,
  readV45SessionState,
  relayV45Intent,
  type V45AccountState,
  type V45RelayResult,
} from "./v45-account-client.ts";
import {
  bindV45SessionKey,
  loadV45Account,
  loadV45SessionKey,
  signV45TradingIntent,
} from "./v45-session-key.ts";
import { parseV44PositionClosedEvent, parseV44PositionOpenedEvent, parseV44TradeEvent, readV44RuntimeState, type V44ExecutionReceipt } from "./v44-market-client.ts";

export type V45TerminalExecution = {
  receipt: V44ExecutionReceipt;
  accountState: V45AccountState;
  relay: V45RelayResult;
};

export function hasLocalV45Session() {
  return Boolean(configuredV45RouterAddress() && loadV45Account() && loadV45SessionKey());
}

async function context(market: string) {
  const router = configuredV45RouterAddress();
  const account = loadV45Account();
  const material = loadV45SessionKey();
  if (!router || !account || !material) throw new Error("Authorize V45 instant trading from the Funding page first.");
  const bound = bindV45SessionKey(material, account);
  const session = await readV45SessionState(bound.sessionId, router);
  const now = Math.floor(Date.now() / 1_000);
  if (!session.active || session.validUntil <= now) throw new Error("The V45 session is inactive or expired. Reauthorize it from Funding.");
  if (session.owner.toLowerCase() !== account.toLowerCase()) throw new Error("The V45 session belongs to another account.");
  if (session.publicKeyHash.toLowerCase() !== bound.publicKeyHash.toLowerCase()) throw new Error("The local V45 key does not match the on-chain authorization.");
  return { router, account, material, bound, session, market: market as Hex };
}

async function simulatedOutput(account: Hex, router: Hex, signature: string, words: string[]) {
  const rpcUrl = process.env.NEXT_PUBLIC_LOCAL_CHAIN_RPC ?? DEFAULT_LOCAL_RPC;
  const result = await rpcRequest<Hex>(rpcUrl, "eth_call", [{ from: account, to: router, data: encodeCall(signature, words) }, "latest"]);
  return decodeUint(decodeWords(result)[0] ?? "0");
}

async function simulatedMarketWords(account: Hex, market: Hex, signature: string, words: string[] = []) {
  const rpcUrl = process.env.NEXT_PUBLIC_LOCAL_CHAIN_RPC ?? DEFAULT_LOCAL_RPC;
  const result = await rpcRequest<Hex>(rpcUrl, "eth_call", [{ from: account, to: market, data: encodeCall(signature, words) }, "latest"]);
  return decodeWords(result).map((word) => decodeUint(word));
}

function protectedMinimum(value: bigint) {
  return value * 9_800n / 10_000n;
}

function protectedMaximum(value: bigint) {
  return (value * 10_020n + 9_999n) / 10_000n;
}

function relayReceipt(relay: V45RelayResult, state: Awaited<ReturnType<typeof readV44RuntimeState>>): V44ExecutionReceipt {
  return {
    account: relay.account,
    transactionHash: relay.transactionHash,
    blockNumber: relay.blockNumber,
    gasUsed: BigInt(relay.gasUsed),
    trade: relay.trade ? {
      ...relay.trade,
      grossWethWei: BigInt(relay.trade.grossWethWei),
      tokenAmountWad: BigInt(relay.trade.tokenAmountWad),
      feeWethWei: BigInt(relay.trade.feeWethWei),
      soldAfterWad: BigInt(relay.trade.soldAfterWad),
      marketCapEthWad: BigInt(relay.trade.marketCapEthWad),
    } : undefined,
    opened: relay.opened ? {
      ...relay.opened,
      positionId: BigInt(relay.opened.positionId),
      collateralWei: BigInt(relay.opened.collateralWei),
      notionalWei: BigInt(relay.opened.notionalWei),
      tokenAmountWad: BigInt(relay.opened.tokenAmountWad),
      entryPriceWad: BigInt(relay.opened.entryPriceWad),
      liquidationPriceWad: BigInt(relay.opened.liquidationPriceWad),
    } : undefined,
    closed: relay.closed ? {
      ...relay.closed,
      positionId: BigInt(relay.closed.positionId),
      payoutWei: BigInt(relay.closed.payoutWei),
      pnlWei: BigInt(relay.closed.pnlWei),
      feeWei: BigInt(relay.closed.feeWei),
      badDebtWei: BigInt(relay.closed.badDebtWei),
    } : undefined,
    state,
  };
}

async function submit(input: {
  market: string;
  action: number;
  amountWei?: bigint;
  collateralWei?: bigint;
  tokenAmountWad?: bigint;
  leverage?: number;
  maintenanceMarginBps?: number;
  positionId?: bigint;
  minOutput?: bigint;
}): Promise<V45TerminalExecution> {
  const ctx = await context(input.market);
  const deadline = Math.floor(Date.now() / 1_000) + 30;
  const signed = await signV45TradingIntent(ctx.material, {
    version: 45,
    sessionId: ctx.bound.sessionId,
    owner: ctx.account,
    router: ctx.router,
    market: ctx.market,
    nonce: ctx.session.nextNonce,
    action: input.action,
    amountWei: String(input.amountWei ?? 0n),
    collateralWei: String(input.collateralWei ?? 0n),
    tokenAmountWad: String(input.tokenAmountWad ?? 0n),
    leverage: input.leverage ?? 0,
    maintenanceMarginBps: input.maintenanceMarginBps ?? 0,
    positionId: String(input.positionId ?? 0n),
    minOutput: String(input.minOutput ?? 0n),
    deadline,
    clientOrderId: globalThis.crypto.randomUUID(),
  });
  const relay = await relayV45Intent(signed);
  const [state, accountState] = await Promise.all([
    readV44RuntimeState(input.market),
    readV45AccountState(ctx.account, input.market, ctx.router),
  ]);
  if (!accountState.solvent) throw new Error("V45 custody reconciliation failed after settlement.");
  return { relay, accountState, receipt: relayReceipt(relay, state) };
}

export async function executeV45SpotBuy(market: string, amountEth: number) {
  const ctx = await context(market);
  const amountWei = toWad(amountEth);
  const quote = await simulatedOutput(ctx.account, ctx.router, "spotBuyFromBalance(address,uint256,uint256)", [encodeAddress(market), encodeUint(amountWei), encodeUint(0)]);
  return submit({ market, action: 1, amountWei, minOutput: quote * 9_800n / 10_000n });
}

export async function executeV45SpotSell(market: string, tokenAmountWad: bigint) {
  const ctx = await context(market);
  const quote = await simulatedOutput(ctx.account, ctx.router, "spotSellFromBalance(address,uint256,uint256)", [encodeAddress(market), encodeUint(tokenAmountWad), encodeUint(0)]);
  return submit({ market, action: 2, tokenAmountWad, minOutput: quote * 9_800n / 10_000n });
}

export async function executeV45OpenPosition(market: string, direction: "long" | "short", leverage: number, collateralEth: number, maintenanceMarginBps = 200) {
  const ctx = await context(market);
  const collateralWei = toWad(collateralEth);
  const quote = await simulatedMarketWords(ctx.account, ctx.market, direction === "long" ? "quoteOpenLong(uint256,uint16)" : "quoteOpenShort(uint256,uint16)", [encodeUint(collateralWei), encodeUint(leverage)]);
  const quotedOutput = direction === "long" ? (quote[3] ?? 0n) : (quote[4] ?? 0n);
  const maxBorrowedTokensWad = direction === "short" ? protectedMaximum(quote[3] ?? 0n) : 0n;
  return submit({ market, action: direction === "long" ? 3 : 4, collateralWei, tokenAmountWad: maxBorrowedTokensWad, leverage, maintenanceMarginBps, minOutput: protectedMinimum(quotedOutput) });
}

export async function executeV45ClosePosition(market: string, direction: "long" | "short", positionId: bigint) {
  const ctx = await context(market);
  const quote = await simulatedMarketWords(ctx.account, ctx.market, "quotePositionEquityWei(uint256)", [encodeUint(positionId)]);
  return submit({ market, action: direction === "long" ? 5 : 6, positionId, minOutput: protectedMinimum(quote[0] ?? 0n) });
}


type DirectReceipt = { blockNumber?: Hex; gasUsed?: Hex; logs?: Array<{ address: Hex; topics: Hex[]; data: Hex }>; status?: Hex; transactionHash?: Hex };

async function directWalletContext() {
  const router = configuredV45RouterAddress();
  const provider = injectedProvider();
  if (!router) throw new Error("V45 account router is not configured.");
  if (!provider) throw new Error("No injected EVM wallet was found for the direct V45 account action.");
  const account = await connectLocalWallet(provider) as Hex;
  return { router, provider, account };
}

async function directAccountAction(market: string, data: Hex, supplied?: Awaited<ReturnType<typeof directWalletContext>>): Promise<V45TerminalExecution> {
  const direct = supplied ?? await directWalletContext();
  const { router, provider, account } = direct;
  const transactionHash = await provider.request<Hex>({ method: "eth_sendTransaction", params: [{ from: account, to: router, data }] });
  const raw = await waitForReceipt(transactionHash, process.env.NEXT_PUBLIC_LOCAL_CHAIN_RPC ?? DEFAULT_LOCAL_RPC, 45_000) as DirectReceipt;
  if (raw.status === "0x0") throw new Error("The direct V45 account transaction reverted.");
  const [state, accountState] = await Promise.all([
    readV44RuntimeState(market),
    readV45AccountState(account, market, router),
  ]);
  if (!accountState.solvent) throw new Error("V45 custody reconciliation failed after direct settlement.");
  const receipt: V44ExecutionReceipt = {
    account,
    transactionHash,
    blockNumber: raw.blockNumber ? Number(BigInt(raw.blockNumber)) : 0,
    gasUsed: raw.gasUsed ? BigInt(raw.gasUsed) : 0n,
    trade: parseV44TradeEvent(raw),
    opened: parseV44PositionOpenedEvent(raw),
    closed: parseV44PositionClosedEvent(raw),
    state,
  };
  const relay: V45RelayResult = {
    ok: true,
    finalized: true,
    action: 0,
    actionLabel: "direct-account",
    account,
    market: market as Hex,
    transactionHash,
    blockNumber: receipt.blockNumber,
    gasUsed: receipt.gasUsed.toString(),
    relayLatencyMs: 0,
    chainFinalityMs: 0,
    accountState: {
      accountWethWei: accountState.accountWethWei.toString(), accountTokenWad: accountState.accountTokenWad.toString(),
      routerEthWei: accountState.routerEthWei.toString(), routerTokenWad: accountState.routerTokenWad.toString(),
      wethLiabilityWei: accountState.wethLiabilityWei.toString(), tokenLiabilityWad: accountState.tokenLiabilityWad.toString(), solvent: accountState.solvent,
    },
  };
  return { receipt, accountState, relay };
}

export async function executeV45DirectSpotBuy(market: string, amountEth: number) {
  const direct = await directWalletContext();
  const amountWei = toWad(amountEth);
  const quote = await simulatedOutput(direct.account, direct.router, "spotBuyFromBalance(address,uint256,uint256)", [encodeAddress(market), encodeUint(amountWei), encodeUint(0)]);
  const deadline = Math.floor(Date.now() / 1_000) + 30;
  return directAccountAction(market, encodeCall("spotBuyFromBalanceWithLimits(address,uint256,uint256,uint64)", [encodeAddress(market), encodeUint(amountWei), encodeUint(protectedMinimum(quote)), encodeUint(deadline)]), direct);
}

export async function executeV45DirectSpotSell(market: string, tokenAmountWad: bigint) {
  const direct = await directWalletContext();
  const quote = await simulatedOutput(direct.account, direct.router, "spotSellFromBalance(address,uint256,uint256)", [encodeAddress(market), encodeUint(tokenAmountWad), encodeUint(0)]);
  const deadline = Math.floor(Date.now() / 1_000) + 30;
  return directAccountAction(market, encodeCall("spotSellFromBalanceWithLimits(address,uint256,uint256,uint64)", [encodeAddress(market), encodeUint(tokenAmountWad), encodeUint(protectedMinimum(quote)), encodeUint(deadline)]), direct);
}

export async function executeV45DirectOpenPosition(market: string, direction: "long" | "short", leverage: number, collateralEth: number, maintenanceMarginBps = 200) {
  const direct = await directWalletContext();
  const collateralWei = toWad(collateralEth);
  const quote = await simulatedMarketWords(direct.account, market as Hex, direction === "long" ? "quoteOpenLong(uint256,uint16)" : "quoteOpenShort(uint256,uint16)", [encodeUint(collateralWei), encodeUint(leverage)]);
  const quotedOutput = direction === "long" ? (quote[3] ?? 0n) : (quote[4] ?? 0n);
  const deadline = Math.floor(Date.now() / 1_000) + 30;
  const signature = direction === "long"
    ? "openLongFromBalanceWithLimits(address,uint16,uint16,uint256,uint256,uint64)"
    : "openShortFromBalanceWithLimits(address,uint16,uint16,uint256,uint256,uint256,uint64)";
  const words = direction === "long"
    ? [encodeAddress(market), encodeUint(leverage), encodeUint(maintenanceMarginBps), encodeUint(collateralWei), encodeUint(protectedMinimum(quotedOutput)), encodeUint(deadline)]
    : [encodeAddress(market), encodeUint(leverage), encodeUint(maintenanceMarginBps), encodeUint(collateralWei), encodeUint(protectedMaximum(quote[3] ?? 0n)), encodeUint(protectedMinimum(quotedOutput)), encodeUint(deadline)];
  return directAccountAction(market, encodeCall(signature, words), direct);
}

export async function executeV45DirectClosePosition(market: string, positionId: bigint) {
  const direct = await directWalletContext();
  const quote = await simulatedMarketWords(direct.account, market as Hex, "quotePositionEquityWei(uint256)", [encodeUint(positionId)]);
  const deadline = Math.floor(Date.now() / 1_000) + 30;
  return directAccountAction(market, encodeCall("closePositionFromBalanceWithLimits(address,uint256,uint256,uint64)", [encodeAddress(market), encodeUint(positionId), encodeUint(protectedMinimum(quote[0] ?? 0n)), encodeUint(deadline)]), direct);
}
