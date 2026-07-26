import { decodeUint, decodeWords, encodeAddress, encodeBytes32, encodeCall, encodeUint, type Hex } from "../chain/abi.ts";
import { DEFAULT_LOCAL_RPC, ethCall, rpcRequest, waitForReceipt } from "../chain/local-battle-client.ts";
import { parseV44PositionClosedEvent, parseV44PositionOpenedEvent, parseV44TradeEvent, readV44RuntimeState } from "../chain/v44-market-client.ts";
import { readV45AccountState, readV45SessionState } from "../chain/v45-account-client.ts";
import { evaluateV46Order, retryDelayMs, type V46StoredOrder } from "../chain/v46-order.ts";
import { leaseV46Order, listV46Orders, releaseV46Lease, updateV46Order } from "./v47-order-store.ts";
import { recordV47Heartbeat } from "./v47-database.ts";

type RpcReceipt = { blockNumber?: Hex; gasUsed?: Hex; status?: Hex; transactionHash?: Hex; logs?: Array<{ address: Hex; topics: Hex[]; data: Hex }> };

export type V46KeeperResult = {
  checked: number;
  activated: number;
  filled: number;
  expired: number;
  retried: number;
  failed: number;
  liquidations: number;
  errors: string[];
  receipts: Array<{ orderId: string; transactionHash: Hex; blockNumber: number }>;
};

function validAddress(value?: string): value is Hex {
  return Boolean(value && /^0x[0-9a-fA-F]{40}$/.test(value));
}

type V51ExecutionBounds = { minOutput: bigint; maxInput: bigint };

function actionCalldata(order: V46StoredOrder, nonce: number, deadline: number, bounds: V51ExecutionBounds) {
  const intent = order.intent;
  const common = [
    encodeBytes32(intent.sessionId),
    encodeUint(nonce),
    encodeAddress(intent.owner),
    encodeAddress(intent.market),
  ];
  const tail = [encodeUint(deadline), encodeBytes32(order.orderHash)];
  switch (intent.action) {
    case 1:
      return encodeCall("executeAuthorizedSpotBuy(bytes32,uint64,address,address,uint256,uint256,uint64,bytes32)", [
        ...common, encodeUint(BigInt(intent.amountWei)), encodeUint(bounds.minOutput), ...tail,
      ]);
    case 3:
      return encodeCall("executeAuthorizedOpenLongWithLimits(bytes32,uint64,address,address,uint16,uint16,uint256,uint256,uint64,bytes32)", [
        ...common, encodeUint(intent.leverage), encodeUint(intent.maintenanceMarginBps), encodeUint(BigInt(intent.collateralWei)), encodeUint(bounds.minOutput), ...tail,
      ]);
    case 4:
      return encodeCall("executeAuthorizedOpenShortWithLimits(bytes32,uint64,address,address,uint16,uint16,uint256,uint256,uint256,uint64,bytes32)", [
        ...common, encodeUint(intent.leverage), encodeUint(intent.maintenanceMarginBps), encodeUint(BigInt(intent.collateralWei)), encodeUint(bounds.maxInput), encodeUint(bounds.minOutput), ...tail,
      ]);
    case 5:
    case 6:
      return encodeCall("executeAuthorizedClosePositionWithLimits(bytes32,uint64,address,address,uint256,uint256,uint8,uint64,bytes32)", [
        ...common, encodeUint(BigInt(intent.positionId)), encodeUint(bounds.minOutput), encodeUint(intent.action), ...tail,
      ]);
    default:
      throw new Error("Unsupported V46 keeper action.");
  }
}

function floorMinimum(value: bigint) { return value * 9_800n / 10_000n; }
function ceilingMaximum(value: bigint) { return (value * 10_020n + 9_999n) / 10_000n; }
function stricterMinimum(configured: bigint, dynamic: bigint) { return configured > dynamic ? configured : dynamic; }

async function currentExecutionBounds(order: V46StoredOrder, rpcUrl: string, router: Hex): Promise<V51ExecutionBounds> {
  const intent = order.intent;
  const configured = BigInt(intent.minOutput);
  if (intent.action === 1) {
    const result = await rpcRequest<Hex>(rpcUrl, "eth_call", [{
      from: intent.owner,
      to: router,
      data: encodeCall("spotBuyFromBalance(address,uint256,uint256)", [encodeAddress(intent.market), encodeUint(BigInt(intent.amountWei)), encodeUint(0)]),
    }, "latest"]);
    const quoted = decodeUint(decodeWords(result)[0] ?? "0");
    return { minOutput: stricterMinimum(configured, floorMinimum(quoted)), maxInput: 0n };
  }
  if (intent.action === 3) {
    const result = await ethCall(rpcUrl, intent.market, encodeCall("quoteOpenLong(uint256,uint16)", [encodeUint(BigInt(intent.collateralWei)), encodeUint(intent.leverage)]));
    const words = decodeWords(result);
    const quoted = decodeUint(words[3] ?? "0");
    return { minOutput: stricterMinimum(configured, floorMinimum(quoted)), maxInput: 0n };
  }
  if (intent.action === 4) {
    const result = await ethCall(rpcUrl, intent.market, encodeCall("quoteOpenShort(uint256,uint16)", [encodeUint(BigInt(intent.collateralWei)), encodeUint(intent.leverage)]));
    const words = decodeWords(result);
    const borrowed = decodeUint(words[3] ?? "0");
    const proceeds = decodeUint(words[4] ?? "0");
    return { minOutput: stricterMinimum(configured, floorMinimum(proceeds)), maxInput: ceilingMaximum(borrowed) };
  }
  const result = await ethCall(rpcUrl, intent.market, encodeCall("quotePositionEquityWei(uint256)", [encodeUint(BigInt(intent.positionId))]));
  const quoted = decodeUint(decodeWords(result)[0] ?? "0");
  return { minOutput: stricterMinimum(configured, floorMinimum(quoted)), maxInput: 0n };
}

function configuredKeeperAccounts(accounts: string[]) {
  const configured = (process.env.V46_KEEPER_ACCOUNTS ?? process.env.V45_SEQUENCER_ACCOUNT ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(validAddress);
  const fallbacks = accounts.slice(1).filter(validAddress);
  return [...new Set([...configured, ...fallbacks])];
}

async function sendWithFailover(rpcUrl: string, transaction: { to: Hex; data: Hex }) {
  const accounts = await rpcRequest<string[]>(rpcUrl, "eth_accounts");
  const keepers = configuredKeeperAccounts(accounts);
  if (!keepers.length) throw new Error("No V46 keeper/sequencer account is available.");
  const errors: string[] = [];
  for (const keeper of keepers) {
    try {
      const transactionHash = await rpcRequest<Hex>(rpcUrl, "eth_sendTransaction", [{ from: keeper, ...transaction }]);
      const receipt = await waitForReceipt(transactionHash, rpcUrl, 45_000) as RpcReceipt;
      if (receipt.status === "0x0") throw new Error("Transaction reverted.");
      return { keeper, transactionHash, receipt };
    } catch (error) {
      errors.push(`${keeper}: ${error instanceof Error ? error.message : "unknown failure"}`);
    }
  }
  throw new Error(`All V46 keepers failed. ${errors.join(" | ")}`);
}

async function settleDueOrder(order: V46StoredOrder, rpcUrl: string, router: Hex, leaseOwner: string) {
  const leased = await leaseV46Order(order.intent.orderId, leaseOwner);
  try {
    const now = Math.floor(Date.now() / 1_000);
    const session = await readV45SessionState(leased.intent.sessionId, router, rpcUrl);
    if (!session.active) throw new Error("Order session is inactive or revoked.");
    if (session.owner.toLowerCase() !== leased.intent.owner.toLowerCase()) throw new Error("Order/session owner mismatch.");
    if (session.publicKeyHash.toLowerCase() !== leased.publicKeyHash.toLowerCase()) throw new Error("Order/session public-key mismatch.");
    if (now >= session.validUntil || now >= leased.intent.expiresAt) throw new Error("Order authorization expired.");
    if ((session.actionBitmap & (1n << BigInt(leased.intent.action))) === 0n) throw new Error("Order action is outside the session scope.");
    const deadline = Math.min(session.validUntil, leased.intent.expiresAt, now + 90);
    const bounds = await currentExecutionBounds(leased, rpcUrl, router);
    const sent = await sendWithFailover(rpcUrl, { to: router, data: actionCalldata(leased, session.nextNonce, deadline, bounds) });
    const account = await readV45AccountState(leased.intent.owner, leased.intent.market, router, rpcUrl);
    if (!account.solvent) throw new Error("Account custody became insolvent after keeper settlement.");
    const blockNumber = sent.receipt.blockNumber ? Number(BigInt(sent.receipt.blockNumber)) : 0;
    const trade = parseV44TradeEvent(sent.receipt);
    const opened = parseV44PositionOpenedEvent(sent.receipt);
    const closed = parseV44PositionClosedEvent(sent.receipt);
    const filled = await releaseV46Lease(leased.intent.orderId, {
      status: "filled",
      attempts: leased.attempts + 1,
      filledAt: Date.now(),
      transactionHash: sent.transactionHash,
      blockNumber,
      failureReason: undefined,
      filledPositionId: opened?.positionId.toString() ?? closed?.positionId.toString(),
      filledTokenAmountWad: trade?.tokenAmountWad.toString() ?? opened?.tokenAmountWad.toString(),
      filledCollateralWei: opened?.collateralWei.toString(),
      filledNotionalWei: opened?.notionalWei.toString(),
      filledEntryPriceWad: opened?.entryPriceWad.toString(),
      filledLiquidationPriceWad: opened?.liquidationPriceWad.toString(),
      filledGrossWethWei: trade?.grossWethWei.toString(),
      filledPayoutWei: closed?.payoutWei.toString(),
      filledPnlWei: closed?.pnlWei.toString(),
      filledMarketCapEthWad: trade?.marketCapEthWad.toString(),
      nextAttemptAt: 0,
    });
    return { order: filled, transactionHash: sent.transactionHash, blockNumber };
  } catch (error) {
    const attempts = leased.attempts + 1;
    const terminal = attempts >= leased.intent.maxAttempts || /expired|revoked|inactive|scope|owner mismatch|public-key mismatch/i.test(error instanceof Error ? error.message : "");
    await releaseV46Lease(leased.intent.orderId, {
      status: terminal ? "failed" : leased.activatedAt ? "watching" : "armed",
      attempts,
      failedAt: terminal ? Date.now() : undefined,
      nextAttemptAt: terminal ? 0 : Date.now() + retryDelayMs(attempts),
      failureReason: error instanceof Error ? error.message : "V46 keeper settlement failed.",
    });
    throw error;
  }
}

function decodeDynamicUintArray(result: Hex) {
  const words = decodeWords(result);
  if (words.length < 2) return [] as bigint[];
  const offsetWords = Number(decodeUint(words[0]) / 32n);
  const lengthIndex = offsetWords;
  const length = Number(decodeUint(words[lengthIndex] ?? "0"));
  return Array.from({ length }, (_, index) => decodeUint(words[lengthIndex + 1 + index] ?? "0"));
}

async function liquidateMarket(market: Hex, rpcUrl: string) {
  const ids = decodeDynamicUintArray(await ethCall(rpcUrl, market, encodeCall("activePositionIds()")));
  const liquidatable: bigint[] = [];
  for (const id of ids.slice(0, 256)) {
    const result = await ethCall(rpcUrl, market, encodeCall("isLiquidatable(uint256)", [encodeUint(id)]));
    if (decodeUint(decodeWords(result)[0] ?? "0") === 1n) liquidatable.push(id);
  }
  if (!liquidatable.length) return { count: 0, transactionHash: undefined as Hex | undefined };
  let count = 0;
  let lastHash: Hex | undefined;
  for (let index = 0; index < liquidatable.length; index += 32) {
    const batch = liquidatable.slice(index, index + 32);
    const data = encodeCall("liquidatePositions(uint256[])", [
      encodeUint(32),
      encodeUint(batch.length),
      ...batch.map((id) => encodeUint(id)),
    ]);
    const sent = await sendWithFailover(rpcUrl, { to: market, data });
    count += batch.length;
    lastHash = sent.transactionHash;
  }
  return { count, transactionHash: lastHash };
}

export async function runV46KeeperCycle(input: { orderId?: string; markets?: string[]; includeLiquidations?: boolean; rpcUrl?: string; router?: string; leaseOwner?: string } = {}): Promise<V46KeeperResult> {
  const rpcUrl = input.rpcUrl ?? process.env.LOCAL_CHAIN_RPC ?? process.env.NEXT_PUBLIC_LOCAL_CHAIN_RPC ?? DEFAULT_LOCAL_RPC;
  const router = input.router ?? process.env.NEXT_PUBLIC_V45_ACCOUNT_ROUTER_ADDRESS;
  if (!validAddress(router)) throw new Error("NEXT_PUBLIC_V45_ACCOUNT_ROUTER_ADDRESS is not configured for V46.");
  const leaseOwner = input.leaseOwner ?? `keeper-${process.pid}-${Date.now()}`;
  const result: V46KeeperResult = { checked: 0, activated: 0, filled: 0, expired: 0, retried: 0, failed: 0, liquidations: 0, errors: [], receipts: [] };
  const chainId = Number(process.env.V47_CHAIN_ID ?? 31337);
  recordV47Heartbeat({ workerId: leaseOwner, role: "keeper", status: "starting", chainId, lastBlock: 0, leaseUntil: Date.now() + 30_000, metadata: { rpcUrl, router } });
  const all = await listV46Orders({ statuses: ["armed", "watching", "failed"] });
  const orders = input.orderId ? all.filter((order) => order.intent.orderId === input.orderId) : all;
  const markets = new Set<string>(input.markets ?? []);
  for (const order of orders) {
    markets.add(order.intent.market);
    result.checked += 1;
    try {
      const state = await readV44RuntimeState(order.intent.market, rpcUrl);
      const evaluation = evaluateV46Order(order, state.marketCapEthWad, Math.floor(Date.now() / 1_000));
      if (evaluation.expire) {
        await updateV46Order(order.intent.orderId, (current) => ({ ...current, status: "expired", lastCheckedAt: Date.now(), lastMarketCapEthWad: state.marketCapEthWad.toString(), failureReason: evaluation.reason }));
        result.expired += 1;
        continue;
      }
      if (evaluation.activate) {
        await updateV46Order(order.intent.orderId, (current) => ({ ...current, status: "watching", activatedAt: Date.now(), lastCheckedAt: Date.now(), lastMarketCapEthWad: state.marketCapEthWad.toString() }));
        result.activated += 1;
        continue;
      }
      if (!evaluation.due) {
        await updateV46Order(order.intent.orderId, (current) => ({ ...current, status: current.status === "failed" ? (current.activatedAt ? "watching" : "armed") : current.status, lastCheckedAt: Date.now(), lastMarketCapEthWad: state.marketCapEthWad.toString() }));
        continue;
      }
      const settled = await settleDueOrder(order, rpcUrl, router, leaseOwner);
      result.filled += 1;
      result.receipts.push({ orderId: order.intent.orderId, transactionHash: settled.transactionHash, blockNumber: settled.blockNumber });
    } catch (error) {
      const message = `${order.intent.orderId}: ${error instanceof Error ? error.message : "keeper error"}`;
      result.errors.push(message);
      const refreshed = (await listV46Orders()).find((item) => item.intent.orderId === order.intent.orderId);
      if (refreshed?.status === "failed") result.failed += 1;
      else result.retried += 1;
    }
  }

  if (input.includeLiquidations !== false) {
    const configuredMarket = process.env.NEXT_PUBLIC_V45_DEMO_MARKET_ADDRESS;
    if (validAddress(configuredMarket)) markets.add(configuredMarket);
    for (const market of markets) {
      if (!validAddress(market)) continue;
      try {
        const liquidation = await liquidateMarket(market, rpcUrl);
        result.liquidations += liquidation.count;
      } catch (error) {
        result.errors.push(`${market} liquidations: ${error instanceof Error ? error.message : "keeper error"}`);
      }
    }
  }
  recordV47Heartbeat({ workerId: leaseOwner, role: "keeper", status: result.errors.length ? "degraded" : "healthy", chainId, lastBlock: Math.max(0, ...result.receipts.map((receipt) => receipt.blockNumber)), leaseUntil: Date.now() + 30_000, metadata: { checked: result.checked, filled: result.filled, liquidations: result.liquidations, errors: result.errors.length } });
  return result;
}
