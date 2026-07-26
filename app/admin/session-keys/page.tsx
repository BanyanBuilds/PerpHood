"use client";

import Link from "next/link";
import {
  Activity,
  ArrowLeft,
  BadgeCheck,
  Clock3,
  Fingerprint,
  Gauge,
  KeyRound,
  LockKeyhole,
  RadioTower,
  RefreshCw,
  ShieldCheck,
  ShieldOff,
  Sparkles,
  WalletCards,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Header } from "@/components/Header";
import { KeyButton } from "@/components/KeyButton";
import { useLocalBattleChain } from "@/hooks/useLocalBattleChain";
import { toWad, type Hex } from "@/lib/chain/abi";
import {
  connectLocalWallet,
  DEFAULT_LOCAL_RPC,
  formatWad,
  readLocalAccountBalance,
  waitForReceipt,
  type LocalAccountBalance,
} from "@/lib/chain/local-battle-client";
import {
  authorizeSession,
  readSessionState,
  relaySponsoredIntent,
  revokeSession,
  type OnChainSessionState,
} from "@/lib/chain/session-battle-client";
import {
  ALL_TRADING_ACTION_BITMAP,
  bindSessionKey,
  clearSessionKey,
  createSessionKeyMaterial,
  loadSessionKey,
  saveSessionKey,
  signTradingIntent,
  type BoundSessionKey,
  type SessionKeyMaterial,
} from "@/lib/chain/session-key";

function shortHash(value?: string | null) {
  if (!value) return "—";
  return `${value.slice(0, 10)}…${value.slice(-8)}`;
}

function wholeTokens(value?: bigint | null) {
  if (value === undefined || value === null) return "—";
  return Number(value / 1_000_000_000_000_000_000n).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function safeWad(value: string) {
  try { return toWad(value || "0"); } catch { return 0n; }
}

export default function SessionKeysPage() {
  const chain = useLocalBattleChain();
  const [account, setAccount] = useState<Hex | null>(null);
  const [balance, setBalance] = useState<LocalAccountBalance | null>(null);
  const [material, setMaterial] = useState<SessionKeyMaterial | null>(null);
  const [session, setSession] = useState<OnChainSessionState | null>(null);
  const [maxNotional, setMaxNotional] = useState("0.05");
  const [durationHours, setDurationHours] = useState("24");
  const [tradeAmount, setTradeAmount] = useState("0.001");
  const [busy, setBusy] = useState<"connect" | "create" | "authorize" | "revoke" | "trade" | "refresh" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [lastLatency, setLastLatency] = useState<{ signMs: number; relayMs: number; finalityMs: number } | null>(null);
  const [lastFill, setLastFill] = useState<{ tokenOut: bigint; impactBps: bigint; tx: Hex; executionSteps: number; liquidationCount: number } | null>(null);

  const contractAddress = process.env.NEXT_PUBLIC_LOCAL_BATTLE_POOL_ADDRESS as Hex | undefined;
  const rpcUrl = process.env.NEXT_PUBLIC_LOCAL_CHAIN_RPC ?? DEFAULT_LOCAL_RPC;
  const bound = useMemo<BoundSessionKey | null>(() => account && material ? bindSessionKey(material, account) : null, [account, material]);

  useEffect(() => setMaterial(loadSessionKey()), []);

  const refresh = useCallback(async () => {
    if (!account || !contractAddress) return;
    setBusy((value) => value ?? "refresh");
    try {
      const nextBalance = await readLocalAccountBalance(account, rpcUrl, contractAddress);
      setBalance(nextBalance);
      if (bound) setSession(await readSessionState(bound.sessionId, rpcUrl, contractAddress));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not refresh session state.");
    } finally {
      setBusy((value) => value === "refresh" ? null : value);
    }
  }, [account, bound, contractAddress, rpcUrl]);

  useEffect(() => { void refresh(); }, [chain.state?.sequence, refresh]);

  const connect = async () => {
    setBusy("connect");
    setNotice(null);
    try {
      const connected = await connectLocalWallet() as Hex;
      setAccount(connected);
      setBalance(await readLocalAccountBalance(connected, rpcUrl, contractAddress));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Wallet connection failed.");
    } finally {
      setBusy(null);
    }
  };

  const createKey = async () => {
    setBusy("create");
    setNotice(null);
    try {
      const next = await createSessionKeyMaterial();
      saveSessionKey(next);
      setMaterial(next);
      setSession(null);
      setNotice("Fresh P-256 session key created locally. It has no authority until your wallet authorizes it.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Session-key generation failed.");
    } finally {
      setBusy(null);
    }
  };

  const authorize = async () => {
    if (!account || !bound || !contractAddress) return;
    setBusy("authorize");
    setNotice(null);
    try {
      const parsedHours = Number(durationHours);
      if (!Number.isFinite(parsedHours) || parsedHours <= 0) throw new Error("Session duration must be positive.");
      const maxNotionalWad = safeWad(maxNotional);
      if (maxNotionalWad <= 0n) throw new Error("Maximum per intent must be positive.");
      const validUntil = Math.floor(Date.now() / 1_000) + Math.ceil(parsedHours * 3_600);
      const transactionHash = await authorizeSession({
        account,
        contractAddress,
        sessionId: bound.sessionId,
        publicKeyHash: bound.publicKeyHash,
        validUntil,
        maxNotionalWad,
        actionBitmap: ALL_TRADING_ACTION_BITMAP,
      });
      await waitForReceipt(transactionHash, rpcUrl);
      setSession(await readSessionState(bound.sessionId, rpcUrl, contractAddress));
      setNotice(`Session authorized once by wallet: ${shortHash(transactionHash)}. Future signed trades use sponsored gas.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Session authorization failed.");
    } finally {
      setBusy(null);
    }
  };

  const revoke = async () => {
    if (!account || !bound || !contractAddress) return;
    setBusy("revoke");
    setNotice(null);
    try {
      const transactionHash = await revokeSession(account, contractAddress, bound.sessionId);
      await waitForReceipt(transactionHash, rpcUrl);
      setSession(await readSessionState(bound.sessionId, rpcUrl, contractAddress));
      setNotice(`Session revoked on-chain: ${shortHash(transactionHash)}.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Session revocation failed.");
    } finally {
      setBusy(null);
    }
  };

  const resetLocalKey = () => {
    clearSessionKey();
    setMaterial(null);
    setSession(null);
    setNotice("Local session key removed from this browser tab. Existing on-chain authorization should also be revoked from the wallet.");
  };

  const sponsoredBuy = async () => {
    if (!account || !bound || !session || !chain.state || !contractAddress) return;
    setBusy("trade");
    setNotice(null);
    const signStarted = performance.now();
    try {
      const amountWad = safeWad(tradeAmount);
      if (amountWad <= 0n) throw new Error("Trade amount must be positive.");
      const signed = await signTradingIntent(material!, {
        version: 23,
        sessionId: bound.sessionId,
        owner: account,
        marketId: chain.state.marketId,
        nonce: session.nextNonce,
        action: 1,
        notionalWad: amountWad.toString(),
        collateralWad: amountWad.toString(),
        tokenAmountWad: "0",
        leverageBps: 10_000,
        positionId: "",
        reduceFractionBps: 10_000,
        limitPriceWad: "0",
        maxSlippageBps: 2_000,
        deadline: Math.floor(Date.now() / 1_000) + 30,
        clientOrderId: globalThis.crypto.randomUUID(),
      });
      const signMs = performance.now() - signStarted;
      const relayed = await relaySponsoredIntent(signed);
      setLastLatency({
        signMs,
        relayMs: relayed.sequencerLatencyMs,
        finalityMs: relayed.chainFinalityMs,
      });
      setLastFill({
        tokenOut: BigInt(relayed.tokenAmountWad),
        impactBps: BigInt(relayed.priceImpactBps),
        tx: relayed.transactionHash,
        executionSteps: relayed.executionSteps,
        liquidationCount: relayed.liquidationCount,
      });
      await refresh();
      setNotice(`Sponsored spot buy settled without another wallet popup: ${shortHash(relayed.transactionHash)}.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Sponsored trade failed.");
    } finally {
      setBusy(null);
    }
  };

  const sessionHealthy = Boolean(session?.active && session.validUntil * 1_000 > Date.now());
  const hasTradeBalance = safeWad(tradeAmount) > 0n && (balance?.wethWad ?? 0n) >= safeWad(tradeAmount);

  return <><Header /><main className="session-key-page page-shell">
    <section className="session-key-hero glass-panel">
      <div><span className="eyebrow">V23 FULL-ACTION SESSION EXECUTION</span><h1>Authorize once. Trade at terminal speed.</h1><p>The wallet approves a limited session one time. After that, browser-held P-256 signatures authorize orders while the sequencer sponsors gas and the BattlePool contract enforces nonce, expiry, action scope, and maximum size.</p></div>
      <div className="session-key-hero-actions"><Link href="/admin/local-chain"><KeyButton compact tone="dark"><ArrowLeft size={15}/>Custody</KeyButton></Link><Link href="/admin/execution"><KeyButton compact><Gauge size={15}/>V23 execution</KeyButton></Link><Link href="/terminal"><KeyButton compact><Gauge size={15}/>Terminal</KeyButton></Link></div>
    </section>

    <section className={`session-key-status glass-panel ${sessionHealthy ? "positive" : "warning"}`}>
      <span><i/><strong>{sessionHealthy ? "Session ready" : "Session not authorized"}</strong><small>{bound ? shortHash(bound.sessionId) : "Create a local key first"}</small></span>
      <span><RadioTower size={17}/><small>Chain frame</small><strong>{chain.state ? `#${chain.state.sequence}` : "Offline"}</strong></span>
      <span><Zap size={17}/><small>Poll target</small><strong>{chain.pollIntervalMs} ms</strong></span>
      <span><Activity size={17}/><small>Next nonce</small><strong>{session?.nextNonce ?? "—"}</strong></span>
      <button onClick={() => void refresh()} aria-label="Refresh session"><RefreshCw size={16}/></button>
    </section>

    <section className="session-key-grid">
      <article className="session-key-card glass-panel">
        <header><span><WalletCards size={18}/><strong>1. Trading wallet</strong></span><b>{account ? shortHash(account) : "Disconnected"}</b></header>
        <p>Connect the funded Anvil wallet that owns the internal BattlePool balance.</p>
        <KeyButton onClick={connect} disabled={busy === "connect"}>{busy === "connect" ? "Connecting…" : account ? "Reconnect wallet" : "Connect local wallet"}</KeyButton>
        <div className="session-key-mini-ledger"><span><small>Internal ETH</small><strong>{balance ? `${formatWad(balance.wethWad)} ETH` : "—"}</strong></span><span><small>Internal tokens</small><strong>{wholeTokens(balance?.tokenAmount)}</strong></span></div>
        <Link className="session-key-inline-link" href="/admin/local-chain">Deposit or withdraw custody balance →</Link>
      </article>

      <article className="session-key-card glass-panel">
        <header><span><Fingerprint size={18}/><strong>2. Browser session key</strong></span><b>{material ? "P-256 READY" : "NONE"}</b></header>
        <p>The private key is created locally and stored only for this browser tab in the V23 prototype.</p>
        <div className="session-key-code"><small>Public-key hash</small><strong>{shortHash(material?.publicKeyHash)}</strong><small>Session ID</small><strong>{shortHash(bound?.sessionId)}</strong></div>
        <div className="session-key-actions"><KeyButton compact onClick={() => void createKey()} disabled={busy === "create"}>{busy === "create" ? "Creating…" : material ? "Rotate local key" : "Create session key"}</KeyButton>{material && <KeyButton compact tone="dark" onClick={resetLocalKey}>Forget local key</KeyButton>}</div>
      </article>

      <article className="session-key-card glass-panel">
        <header><span><LockKeyhole size={18}/><strong>3. On-chain limits</strong></span><b>{sessionHealthy ? "ACTIVE" : "LOCKED"}</b></header>
        <p>This is the only wallet approval required for normal trading during the authorized window.</p>
        <label><span>Maximum per intent</span><input value={maxNotional} onChange={(event) => setMaxNotional(event.target.value)} inputMode="decimal"/><b>ETH</b></label>
        <label><span>Session duration</span><input value={durationHours} onChange={(event) => setDurationHours(event.target.value)} inputMode="numeric"/><b>hours</b></label>
        <div className="session-key-actions"><KeyButton compact onClick={() => void authorize()} disabled={!account || !bound || busy === "authorize"}>{busy === "authorize" ? "Authorizing…" : "Authorize once"}</KeyButton>{session?.active && <KeyButton compact tone="red" onClick={() => void revoke()} disabled={busy === "revoke"}><ShieldOff size={14}/>Revoke</KeyButton>}</div>
      </article>
    </section>

    <section className="sponsored-trade-card glass-panel">
      <div className="sponsored-trade-copy"><span className="eyebrow">NO-POPUP EXECUTION TEST</span><h2>Signed Buy × Sell × Long × Short pipeline</h2><p>This smoke control executes a sponsored spot buy. The new full-action console covers sells, leveraged opens, partial closes, and keeper liquidations through the same ordered pipeline.</p></div>
      <div className="sponsored-trade-controls"><label><span>Buy amount</span><input value={tradeAmount} onChange={(event) => setTradeAmount(event.target.value)} inputMode="decimal"/><b>ETH</b></label><KeyButton onClick={() => void sponsoredBuy()} disabled={!sessionHealthy || !hasTradeBalance || busy === "trade"}><Sparkles size={16}/>{busy === "trade" ? "Signing + settling…" : "Execute sponsored buy"}</KeyButton></div>
      <div className="sponsored-trade-metrics">
        <span><KeyRound size={16}/><small>Intent signing</small><strong>{lastLatency ? `${lastLatency.signMs.toFixed(2)} ms` : "—"}</strong></span>
        <span><RadioTower size={16}/><small>Relay acceptance</small><strong>{lastLatency ? `${lastLatency.relayMs.toFixed(2)} ms` : "—"}</strong></span>
        <span><Clock3 size={16}/><small>Local finality</small><strong>{lastLatency ? `${lastLatency.finalityMs.toFixed(2)} ms` : "—"}</strong></span>
        <span><BadgeCheck size={16}/><small>Tokens received</small><strong>{lastFill ? wholeTokens(lastFill.tokenOut) : "—"}</strong></span>
      </div>
      {lastFill && <footer><ShieldCheck size={16}/><span>Price impact {(Number(lastFill.impactBps) / 100).toFixed(2)}% · {lastFill.executionSteps} execution boundary{lastFill.executionSteps === 1 ? "" : "s"} · {lastFill.liquidationCount} liquidation{lastFill.liquidationCount === 1 ? "" : "s"} · transaction {shortHash(lastFill.tx)}</span></footer>}
    </section>

    <section className="session-key-flow glass-panel"><div><span>1</span><strong>Wallet authorizes</strong><small>Owner, key hash, expiry, action bitmap and max notional are stored on-chain.</small></div><i/><div><span>2</span><strong>Browser signs</strong><small>P-256 intent signing happens locally in milliseconds with no wallet modal.</small></div><i/><div><span>3</span><strong>Relay verifies</strong><small>Signature, public key, nonce, deadline, balance and reserve quote are checked.</small></div><i/><div><span>4</span><strong>Pool settles</strong><small>The sponsored sequencer transaction still must conserve every token and wei.</small></div></section>

    {notice && <section className="session-key-notice glass-panel">{notice}</section>}
    <section className="local-chain-warning glass-panel"><ShieldCheck size={21}/><span><strong>V23 local prototype—not production key custody</strong><small>Production should keep non-exportable session keys in secure browser or device storage, run redundant relays, and independently audit contract and sequencer rules. The local prototype intentionally makes the authority path visible and testable.</small></span></section>
  </main></>;
}
