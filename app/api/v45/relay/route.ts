import { NextResponse } from "next/server";
import {
  encodeAddress,
  encodeBytes32,
  encodeCall,
  encodeUint,
  type Hex,
} from "@/lib/chain/abi.ts";
import {
  DEFAULT_LOCAL_RPC,
  rpcRequest,
  waitForReceipt,
} from "@/lib/chain/local-battle-client.ts";
import {
  parseV44PositionClosedEvent,
  parseV44PositionOpenedEvent,
  parseV44TradeEvent,
  readV44RuntimeState,
} from "@/lib/chain/v44-market-client.ts";
import {
  readV45AccountState,
  readV45SessionState,
} from "@/lib/chain/v45-account-client.ts";
import {
  verifyV45SignedTradingIntent,
  type V45SignedTradingIntent,
} from "@/lib/chain/v45-session-key.ts";

export const dynamic = "force-dynamic";

type RpcLog = { address: Hex; topics: Hex[]; data: Hex };
type RpcReceipt = { blockNumber?: Hex; gasUsed?: Hex; logs?: RpcLog[]; status?: Hex; transactionHash?: Hex };

type RelayRuntime = { lockedSessions: Set<string>; consumedClientOrderIds: Set<string> };
const globalRelay = globalThis as typeof globalThis & { __perphoodV45Relay?: RelayRuntime };
const relayRuntime = globalRelay.__perphoodV45Relay ??= { lockedSessions: new Set(), consumedClientOrderIds: new Set() };

const ACTION_LABELS: Record<number, string> = {
  1: "Spot buy",
  2: "Spot sell",
  3: "Open long",
  4: "Open short",
  5: "Close long",
  6: "Close short",
};

function sameHex(a?: string, b?: string) { return Boolean(a && b && a.toLowerCase() === b.toLowerCase()); }
function validAddress(value?: string) { return Boolean(value && /^0x[0-9a-fA-F]{40}$/.test(value)); }
function validBytes32(value?: string) { return Boolean(value && /^0x[0-9a-fA-F]{64}$/.test(value)); }

function serializeTrade(value: ReturnType<typeof parseV44TradeEvent>) {
  return value ? {
    ...value,
    grossWethWei: value.grossWethWei.toString(),
    tokenAmountWad: value.tokenAmountWad.toString(),
    feeWethWei: value.feeWethWei.toString(),
    soldAfterWad: value.soldAfterWad.toString(),
    marketCapEthWad: value.marketCapEthWad.toString(),
  } : undefined;
}

function serializeOpened(value: ReturnType<typeof parseV44PositionOpenedEvent>) {
  return value ? {
    ...value,
    positionId: value.positionId.toString(),
    collateralWei: value.collateralWei.toString(),
    notionalWei: value.notionalWei.toString(),
    tokenAmountWad: value.tokenAmountWad.toString(),
    entryPriceWad: value.entryPriceWad.toString(),
    liquidationPriceWad: value.liquidationPriceWad.toString(),
  } : undefined;
}

function serializeClosed(value: ReturnType<typeof parseV44PositionClosedEvent>) {
  return value ? {
    ...value,
    positionId: value.positionId.toString(),
    payoutWei: value.payoutWei.toString(),
    pnlWei: value.pnlWei.toString(),
    feeWei: value.feeWei.toString(),
    badDebtWei: value.badDebtWei.toString(),
  } : undefined;
}

function calldataFor(signed: V45SignedTradingIntent) {
  const intent = signed.intent;
  const common = [
    encodeBytes32(intent.sessionId),
    encodeUint(intent.nonce),
    encodeAddress(intent.owner),
    encodeAddress(intent.market),
  ];
  const tail = [encodeUint(intent.deadline), encodeBytes32(signed.intentHash)];
  switch (intent.action) {
    case 1:
      return encodeCall("executeAuthorizedSpotBuy(bytes32,uint64,address,address,uint256,uint256,uint64,bytes32)", [
        ...common, encodeUint(BigInt(intent.amountWei)), encodeUint(BigInt(intent.minOutput)), ...tail,
      ]);
    case 2:
      return encodeCall("executeAuthorizedSpotSell(bytes32,uint64,address,address,uint256,uint256,uint64,bytes32)", [
        ...common, encodeUint(BigInt(intent.tokenAmountWad)), encodeUint(BigInt(intent.minOutput)), ...tail,
      ]);
    case 3:
      return encodeCall("executeAuthorizedOpenLongWithLimits(bytes32,uint64,address,address,uint16,uint16,uint256,uint256,uint64,bytes32)", [
        ...common, encodeUint(intent.leverage), encodeUint(intent.maintenanceMarginBps), encodeUint(BigInt(intent.collateralWei)), encodeUint(BigInt(intent.minOutput)), ...tail,
      ]);
    case 4:
      return encodeCall("executeAuthorizedOpenShortWithLimits(bytes32,uint64,address,address,uint16,uint16,uint256,uint256,uint256,uint64,bytes32)", [
        ...common, encodeUint(intent.leverage), encodeUint(intent.maintenanceMarginBps), encodeUint(BigInt(intent.collateralWei)), encodeUint(BigInt(intent.tokenAmountWad)), encodeUint(BigInt(intent.minOutput)), ...tail,
      ]);
    case 5:
    case 6:
      return encodeCall("executeAuthorizedClosePositionWithLimits(bytes32,uint64,address,address,uint256,uint256,uint8,uint64,bytes32)", [
        ...common, encodeUint(BigInt(intent.positionId)), encodeUint(BigInt(intent.minOutput)), encodeUint(intent.action), ...tail,
      ]);
    default:
      throw new Error("Unsupported V45 session action.");
  }
}

export async function POST(request: Request) {
  const startedAt = performance.now();
  let lockedSession: string | null = null;
  try {
    const body = await request.json() as { signedIntent?: V45SignedTradingIntent };
    const signed = body.signedIntent;
    if (!signed || !await verifyV45SignedTradingIntent(signed)) throw new Error("Invalid P-256 V45 session signature.");
    const intent = signed.intent;
    if (intent.version !== 45) throw new Error("Unsupported V45 intent version.");
    if (!validAddress(intent.owner) || !validAddress(intent.router) || !validAddress(intent.market)) throw new Error("Malformed V45 intent address.");
    if (!validBytes32(intent.sessionId) || !validBytes32(signed.intentHash)) throw new Error("Malformed V45 intent hash.");
    if (!ACTION_LABELS[intent.action]) throw new Error("Unsupported V45 action.");
    if (!Number.isInteger(intent.nonce) || intent.nonce < 0) throw new Error("Invalid V45 session nonce.");
    if (!Number.isInteger(intent.deadline) || intent.deadline <= 0) throw new Error("Invalid V45 intent deadline.");
    if (!intent.clientOrderId || intent.clientOrderId.length > 128) throw new Error("Invalid client order ID.");

    const router = process.env.NEXT_PUBLIC_V45_ACCOUNT_ROUTER_ADDRESS as Hex | undefined;
    if (!router || !validAddress(router)) throw new Error("NEXT_PUBLIC_V45_ACCOUNT_ROUTER_ADDRESS is not configured.");
    if (!sameHex(router, intent.router)) throw new Error("Intent router does not match this relay.");

    const lockKey = intent.sessionId.toLowerCase();
    if (relayRuntime.lockedSessions.has(lockKey)) throw new Error("Another intent for this session is already settling.");
    if (relayRuntime.consumedClientOrderIds.has(intent.clientOrderId)) throw new Error("Client order ID was already relayed.");
    relayRuntime.lockedSessions.add(lockKey);
    lockedSession = lockKey;

    const rpcUrl = process.env.LOCAL_CHAIN_RPC ?? process.env.NEXT_PUBLIC_LOCAL_CHAIN_RPC ?? DEFAULT_LOCAL_RPC;
    const now = Math.floor(Date.now() / 1_000);
    const session = await readV45SessionState(intent.sessionId, router, rpcUrl);
    if (!session.active) throw new Error("V45 session is inactive or revoked.");
    if (!sameHex(session.owner, intent.owner)) throw new Error("V45 session owner mismatch.");
    if (!sameHex(session.publicKeyHash, signed.publicKeyHash)) throw new Error("V45 public-key authorization mismatch.");
    if (session.nextNonce !== intent.nonce) throw new Error(`V45 session nonce mismatch. Expected ${session.nextNonce}.`);
    if (now > intent.deadline || intent.deadline > session.validUntil) throw new Error("V45 intent deadline is outside the session lifetime.");
    if ((session.actionBitmap & (1n << BigInt(intent.action))) === 0n) throw new Error("V45 action is not authorized.");

    const accounts = await rpcRequest<string[]>(rpcUrl, "eth_accounts");
    const sequencer = (process.env.V45_SEQUENCER_ACCOUNT ?? accounts[1]) as Hex | undefined;
    if (!sequencer || !validAddress(sequencer)) throw new Error("V45 sequencer account is unavailable.");

    const transactionHash = await rpcRequest<Hex>(rpcUrl, "eth_sendTransaction", [{
      from: sequencer,
      to: router,
      data: calldataFor(signed),
    }]);
    const finalityStartedAt = performance.now();
    const receipt = await waitForReceipt(transactionHash, rpcUrl, 45_000) as RpcReceipt;
    const chainFinalityMs = performance.now() - finalityStartedAt;
    if (receipt.status === "0x0") throw new Error("V45 authorized settlement reverted.");
    relayRuntime.consumedClientOrderIds.add(intent.clientOrderId);

    const [accountState] = await Promise.all([
      readV45AccountState(intent.owner, intent.market, router, rpcUrl),
      readV44RuntimeState(intent.market, rpcUrl),
    ]);
    if (!accountState.solvent) throw new Error("V45 account custody is not solvent after settlement.");

    return NextResponse.json({
      ok: true,
      finalized: true,
      action: intent.action,
      actionLabel: ACTION_LABELS[intent.action],
      account: intent.owner,
      market: intent.market,
      transactionHash,
      blockNumber: receipt.blockNumber ? Number(BigInt(receipt.blockNumber)) : 0,
      gasUsed: receipt.gasUsed ? BigInt(receipt.gasUsed).toString() : "0",
      relayLatencyMs: performance.now() - startedAt,
      chainFinalityMs,
      accountState: {
        accountWethWei: accountState.accountWethWei.toString(),
        accountTokenWad: accountState.accountTokenWad.toString(),
        routerEthWei: accountState.routerEthWei.toString(),
        routerTokenWad: accountState.routerTokenWad.toString(),
        wethLiabilityWei: accountState.wethLiabilityWei.toString(),
        tokenLiabilityWad: accountState.tokenLiabilityWad.toString(),
        solvent: accountState.solvent,
      },
      trade: serializeTrade(parseV44TradeEvent(receipt)),
      opened: serializeOpened(parseV44PositionOpenedEvent(receipt)),
      closed: serializeClosed(parseV44PositionClosedEvent(receipt)),
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "V45 authorized relay failed.",
      relayLatencyMs: performance.now() - startedAt,
    }, { status: 400, headers: { "cache-control": "no-store" } });
  } finally {
    if (lockedSession) globalThis.setTimeout(() => relayRuntime.lockedSessions.delete(lockedSession!), 300);
  }
}
