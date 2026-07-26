import { NextResponse } from "next/server";
import {
  DEFAULT_LOCAL_RPC,
  readLocalAccountBalance,
  readLocalBattleState,
  rpcRequest,
  waitForReceipt,
  type LocalBattleState,
} from "@/lib/chain/local-battle-client.ts";
import { readSessionState } from "@/lib/chain/session-battle-client.ts";
import { verifySignedTradingIntent, type SignedTradingIntent } from "@/lib/chain/session-key.ts";
import { buildSponsoredTradeQuote } from "@/lib/chain/sponsored-quote.ts";
import { loadSequencerState, persistSequencerState, stageSequencerState } from "@/lib/chain/local-sequencer-state.ts";
import { encodeAuthorizedSingleAccountSettlement } from "@/lib/chain/settlement-frame.ts";
import { isUserTradingAction } from "@/lib/chain/trading-actions.ts";
import type { Hex } from "@/lib/chain/abi.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_ANVIL_SEQUENCER = "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266" as Hex;

type RelayRuntime = {
  lockedSessions: Set<string>;
  seenIntentUntil: Map<string, number>;
};

const relayGlobal = globalThis as typeof globalThis & { __perphoodV23Relay?: RelayRuntime };
const relayRuntime = relayGlobal.__perphoodV23Relay ??= { lockedSessions: new Set(), seenIntentUntil: new Map() };

function acquireRelaySlot(sessionId: string, intentHash: string) {
  const now = Date.now();
  for (const [hash, expiresAt] of relayRuntime.seenIntentUntil) {
    if (expiresAt <= now) relayRuntime.seenIntentUntil.delete(hash);
  }
  if ((relayRuntime.seenIntentUntil.get(intentHash) ?? 0) > now) throw new Error("Duplicate intent is already pending or recently relayed.");
  if (relayRuntime.lockedSessions.has(sessionId)) throw new Error("Another intent for this session is already settling.");
  relayRuntime.lockedSessions.add(sessionId);
  relayRuntime.seenIntentUntil.set(intentHash, now + 60_000);
}

function releaseRelaySlot(sessionId: string) {
  globalThis.setTimeout(() => relayRuntime.lockedSessions.delete(sessionId), 350);
}

function sameHex(left: string, right: string) {
  return left.toLowerCase() === right.toLowerCase();
}

function configuredAddress() {
  const value = process.env.NEXT_PUBLIC_LOCAL_BATTLE_POOL_ADDRESS;
  if (!value || !/^0x[0-9a-fA-F]{40}$/.test(value)) throw new Error("NEXT_PUBLIC_LOCAL_BATTLE_POOL_ADDRESS is not configured.");
  return value.toLowerCase() as Hex;
}

function configuredSequencer() {
  const value = process.env.V23_SEQUENCER_ACCOUNT ?? process.env.V22_SEQUENCER_ACCOUNT ?? DEFAULT_ANVIL_SEQUENCER;
  if (!/^0x[0-9a-fA-F]{40}$/.test(value)) throw new Error("V23_SEQUENCER_ACCOUNT is invalid.");
  return value.toLowerCase() as Hex;
}

function assertFreshState(state: LocalBattleState) {
  if (!state.custodySolvent) throw new Error("BattlePool custody invariant is not healthy.");
  if (state.rpcLatencyMs > 5_000) throw new Error("BattlePool RPC state is too stale to relay safely.");
}

export async function POST(request: Request) {
  const startedAt = performance.now();
  let lockedSessionId: string | null = null;
  try {
    const body = await request.json() as { signedIntent?: SignedTradingIntent };
    if (!body.signedIntent) throw new Error("Signed trading intent is required.");
    const signedIntent = body.signedIntent;
    const intent = signedIntent.intent;
    if (!await verifySignedTradingIntent(signedIntent)) throw new Error("Invalid P-256 session signature.");
    if (!isUserTradingAction(intent.action)) throw new Error("Session relay only accepts Buy, Sell, Long, Short, and position-close actions.");
    acquireRelaySlot(intent.sessionId, signedIntent.intentHash);
    lockedSessionId = intent.sessionId;

    const now = Math.floor(Date.now() / 1_000);
    if (!Number.isInteger(intent.deadline) || intent.deadline <= now) throw new Error("Trading intent has expired.");
    const rpcUrl = process.env.LOCAL_CHAIN_RPC ?? process.env.NEXT_PUBLIC_LOCAL_CHAIN_RPC ?? DEFAULT_LOCAL_RPC;
    const contractAddress = configuredAddress();
    const sequencerAccount = configuredSequencer();
    const [state, session, accountBalance] = await Promise.all([
      readLocalBattleState(rpcUrl, contractAddress),
      readSessionState(intent.sessionId, rpcUrl, contractAddress),
      readLocalAccountBalance(intent.owner, rpcUrl, contractAddress),
    ]);
    assertFreshState(state);
    if (!sameHex(state.marketId, intent.marketId)) throw new Error("Intent market does not match the authoritative BattlePool.");
    if (!session.active) throw new Error("Session is inactive or revoked.");
    if (!sameHex(session.owner, intent.owner)) throw new Error("Session owner does not match the trading account.");
    if (!sameHex(session.publicKeyHash, signedIntent.publicKeyHash)) throw new Error("Authorized public-key hash does not match the signature key.");
    if (session.nextNonce !== intent.nonce) throw new Error(`Session nonce mismatch. Expected ${session.nextNonce}.`);
    if (session.validUntil < now || session.validUntil < intent.deadline) throw new Error("Intent deadline exceeds the authorized session lifetime.");
    const notionalWad = BigInt(intent.notionalWad);
    if (notionalWad > session.maxNotionalWad) throw new Error("Intent exceeds the session notional limit.");
    if ((session.actionBitmap & (1n << BigInt(intent.action))) === 0n) throw new Error("This action is not authorized for the session.");

    const sequencerState = await loadSequencerState(contractAddress, state);
    const quote = buildSponsoredTradeQuote({
      chainState: state,
      enginePool: sequencerState.pool,
      positions: sequencerState.positions,
      signedIntent,
      sessionNonce: session.nextNonce,
    });
    if (accountBalance.wethWad + quote.accountWethDeltaWad < 0n) throw new Error("Internal WETH balance is too low for this action.");
    if (accountBalance.tokenAmount + quote.accountTokenDelta < 0n) throw new Error("Internal token balance is too low for this action.");

    await stageSequencerState({
      contractAddress,
      chainState: state,
      intentHash: signedIntent.intentHash,
      positionsRoot: quote.settlement.frame.positionsRoot,
      balancesRoot: quote.settlement.frame.balancesRoot,
      pool: quote.nextPool,
      positions: quote.remainingPositions,
    });
    const sequencerLatencyMs = performance.now() - startedAt;
    const finalityStartedAt = performance.now();
    const transactionHash = await rpcRequest<Hex>(rpcUrl, "eth_sendTransaction", [{
      from: sequencerAccount,
      to: contractAddress,
      data: encodeAuthorizedSingleAccountSettlement(quote.settlement),
    }]);
    const receipt = await waitForReceipt(transactionHash, rpcUrl);
    const chainFinalityMs = performance.now() - finalityStartedAt;
    const receiptStatus = typeof receipt.status === "string" ? receipt.status.toLowerCase() : "";
    if (receiptStatus === "0x0") throw new Error("Sponsored settlement reverted on the authoritative chain.");

    const finalizedState = await readLocalBattleState(rpcUrl, contractAddress);
    if (finalizedState.sequence !== Number(quote.settlement.expectedSequence)) {
      throw new Error(`Finalized sequence mismatch. Expected ${quote.settlement.expectedSequence}, received ${finalizedState.sequence}.`);
    }
    if (!finalizedState.custodySolvent) throw new Error("Finalized BattlePool custody invariant is not healthy.");
    await persistSequencerState({
      contractAddress,
      chainState: finalizedState,
      pool: quote.nextPool,
      positions: quote.remainingPositions,
    });

    return NextResponse.json({
      ok: true,
      finalized: true,
      action: quote.action,
      actionLabel: quote.actionLabel,
      transactionHash,
      sequence: finalizedState.sequence.toString(),
      stateHash: finalizedState.stateHash,
      grossWethWad: quote.grossWethWad.toString(),
      netWethWad: quote.netWethWad.toString(),
      feeWad: quote.feeWad.toString(),
      tokenAmountWad: quote.tokenAmountWad.toString(),
      payoutWad: quote.payoutWad.toString(),
      priceAfterWad: quote.priceAfterWad.toString(),
      priceImpactBps: quote.priceImpactBps.toString(),
      executionSteps: quote.executionSteps,
      liquidationCount: quote.liquidationCount,
      position: quote.position,
      closedPositionId: quote.closedPositionId,
      sequencerLatencyMs,
      chainFinalityMs,
      relayLatencyMs: performance.now() - startedAt,
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "Sponsored relay failed.",
      relayLatencyMs: performance.now() - startedAt,
    }, { status: 400, headers: { "cache-control": "no-store" } });
  } finally {
    if (lockedSessionId) releaseRelaySlot(lockedSessionId);
  }
}
