"use client";

import Link from "next/link";
import { Activity, ArrowLeft, Crosshair, Gauge, RefreshCw, ShieldCheck, Skull, Zap } from "lucide-react";
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
  type LocalAccountBalance,
} from "@/lib/chain/local-battle-client";
import { readSessionState, relaySponsoredIntent, type OnChainSessionState, type SponsoredIntentRelayResult } from "@/lib/chain/session-battle-client";
import { bindSessionKey, loadSessionKey, signTradingIntent, type BoundSessionKey, type SessionKeyMaterial } from "@/lib/chain/session-key";
import { TradingAction, tradingActionLabel, type UserTradingAction } from "@/lib/chain/trading-actions";
import type { Position } from "@/lib/types";

type StatePayload = {
  ok: boolean;
  error?: string;
  engine?: {
    priceEth: number;
    marketCapEth: number;
    realWethBalance: number;
    freeWeth: number;
    reservedPositionEquity: number;
    poolFeesEth: number;
    liquidationEquityEth: number;
    badDebtEth: number;
    shortInventoryUtilization: number;
  };
  positions?: Position[];
  allPositionCount?: number;
};

const ACTIONS: UserTradingAction[] = [1, 2, 3, 5, 4, 6];

function shortHash(value?: string | null) {
  if (!value) return "—";
  return `${value.slice(0, 10)}…${value.slice(-8)}`;
}

function safeWad(value: string) {
  try { return toWad(value || "0"); } catch { return 0n; }
}

function wholeTokenWad(value: string) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return 0n;
  return BigInt(Math.floor(number * 1e18));
}

function isClose(action: number) {
  return action === TradingAction.CloseLong || action === TradingAction.CloseShort;
}

export default function V23ExecutionPage() {
  const chain = useLocalBattleChain();
  const [account, setAccount] = useState<Hex | null>(null);
  const [balance, setBalance] = useState<LocalAccountBalance | null>(null);
  const [material, setMaterial] = useState<SessionKeyMaterial | null>(null);
  const [session, setSession] = useState<OnChainSessionState | null>(null);
  const [state, setState] = useState<StatePayload | null>(null);
  const [action, setAction] = useState<UserTradingAction>(TradingAction.SpotBuy);
  const [amount, setAmount] = useState("0.001");
  const [leverage, setLeverage] = useState("10");
  const [fraction, setFraction] = useState("100");
  const [positionId, setPositionId] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [last, setLast] = useState<SponsoredIntentRelayResult | null>(null);
  const contractAddress = process.env.NEXT_PUBLIC_LOCAL_BATTLE_POOL_ADDRESS as Hex | undefined;
  const rpcUrl = process.env.NEXT_PUBLIC_LOCAL_CHAIN_RPC ?? DEFAULT_LOCAL_RPC;
  const bound = useMemo<BoundSessionKey | null>(() => account && material ? bindSessionKey(material, account) : null, [account, material]);

  useEffect(() => setMaterial(loadSessionKey()), []);

  const refresh = useCallback(async () => {
    if (!account || !contractAddress) return;
    try {
      const [nextBalance, nextSession, stateResponse] = await Promise.all([
        readLocalAccountBalance(account, rpcUrl, contractAddress),
        bound ? readSessionState(bound.sessionId, rpcUrl, contractAddress) : Promise.resolve(null),
        fetch(`/api/v23/state?owner=${account}`, { cache: "no-store" }).then((response) => response.json() as Promise<StatePayload>),
      ]);
      setBalance(nextBalance);
      setSession(nextSession);
      setState(stateResponse);
      const positions = stateResponse.positions ?? [];
      if (!positionId && positions.length) setPositionId(positions[0].id);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not refresh V23 execution state.");
    }
  }, [account, bound, contractAddress, positionId, rpcUrl]);

  useEffect(() => { void refresh(); }, [chain.state?.sequence, refresh]);

  const connect = async () => {
    setBusy("connect");
    try {
      const connected = await connectLocalWallet() as Hex;
      setAccount(connected);
      setNotice("Trading wallet connected. Use the Session Keys page first if this browser key is not authorized.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Wallet connection failed.");
    } finally {
      setBusy(null);
    }
  };

  const selectedPosition = (state?.positions ?? []).find((position) => position.id === positionId);
  const healthy = Boolean(account && material && bound && session?.active && session.validUntil * 1000 > Date.now());

  const execute = async () => {
    if (!account || !material || !bound || !session || !chain.state) return;
    setBusy("execute");
    setNotice(null);
    try {
      const numericAmount = Number(amount);
      const numericLeverage = Number(leverage);
      const fractionBps = Math.round(Number(fraction) * 100);
      if (!Number.isFinite(numericAmount) || numericAmount <= 0) throw new Error("Enter a positive trade amount.");
      if (!Number.isFinite(numericLeverage) || numericLeverage < 1 || numericLeverage > 20) throw new Error("Leverage must remain between 1× and 20×.");

      let notionalWad = safeWad(amount);
      let collateralWad = safeWad(amount);
      let tokenAmountWad = 0n;
      let intentPositionId = "";
      if (action === TradingAction.SpotSell) {
        tokenAmountWad = wholeTokenWad(amount);
        const currentPrice = state?.engine?.priceEth ?? 0;
        notionalWad = toWad((numericAmount * currentPrice).toFixed(18));
        collateralWad = 0n;
      } else if (action === TradingAction.OpenLong || action === TradingAction.OpenShort) {
        notionalWad = toWad((numericAmount * numericLeverage).toFixed(18));
      } else if (isClose(action)) {
        if (!selectedPosition) throw new Error("Select an open position to close.");
        if (action === TradingAction.CloseLong && selectedPosition.direction !== "long") throw new Error("Select a long position for Close long.");
        if (action === TradingAction.CloseShort && selectedPosition.direction !== "short") throw new Error("Select a short position for Close short.");
        intentPositionId = selectedPosition.id;
        notionalWad = toWad((selectedPosition.notional * fractionBps / 10_000).toFixed(18));
        collateralWad = 0n;
      }
      if (notionalWad <= 0n) throw new Error("Signed notional resolved to zero.");

      const signStarted = performance.now();
      const signed = await signTradingIntent(material, {
        version: 23,
        sessionId: bound.sessionId,
        owner: account,
        marketId: chain.state.marketId,
        nonce: session.nextNonce,
        action,
        notionalWad: notionalWad.toString(),
        collateralWad: collateralWad.toString(),
        tokenAmountWad: tokenAmountWad.toString(),
        leverageBps: Math.round(numericLeverage * 10_000),
        positionId: intentPositionId,
        reduceFractionBps: isClose(action) ? fractionBps : 10_000,
        limitPriceWad: "0",
        maxSlippageBps: 5_000,
        deadline: Math.floor(Date.now() / 1_000) + 30,
        clientOrderId: globalThis.crypto.randomUUID(),
      });
      const signMs = performance.now() - signStarted;
      const result = await relaySponsoredIntent(signed);
      setLast(result);
      await refresh();
      setNotice(`${result.actionLabel} finalized with no wallet popup. Signing ${signMs.toFixed(2)} ms · chain ${result.chainFinalityMs.toFixed(2)} ms.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "V23 execution failed.");
    } finally {
      setBusy(null);
    }
  };

  const liquidate = async () => {
    setBusy("liquidate");
    try {
      const response = await fetch("/api/v23/liquidate", { method: "POST" });
      const payload = await response.json() as { ok?: boolean; error?: string; liquidationCount?: number; transactionHash?: string; message?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error ?? "Keeper liquidation failed.");
      await refresh();
      setNotice(payload.liquidationCount ? `Keeper finalized ${payload.liquidationCount} liquidation(s): ${shortHash(payload.transactionHash)}.` : payload.message ?? "No liquidations required.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Keeper liquidation failed.");
    } finally {
      setBusy(null);
    }
  };

  return <><Header/><main className="session-key-page page-shell">
    <section className="session-key-hero glass-panel">
      <div><span className="eyebrow">V23 FULL-ACTION FAST PATH</span><h1>Buy × Sell × Long × Short—one signed pipeline.</h1><p>Every action signs locally, executes against the exact exponent-5 BattleCurve, processes liquidation boundaries, settles real internal balances, and commits one authoritative chain frame.</p></div>
      <div className="session-key-hero-actions"><Link href="/admin/session-keys"><KeyButton compact tone="dark"><ArrowLeft size={15}/>Session keys</KeyButton></Link><Link href="/terminal"><KeyButton compact><Gauge size={15}/>Terminal</KeyButton></Link></div>
    </section>

    <section className={`session-key-status glass-panel ${healthy ? "positive" : "warning"}`}>
      <span><i/><strong>{healthy ? "Full-action session ready" : "Connect + authorize session"}</strong><small>{account ? shortHash(account) : "No wallet"}</small></span>
      <span><Zap size={17}/><small>Chain frame</small><strong>{chain.state ? `#${chain.state.sequence}` : "Offline"}</strong></span>
      <span><Activity size={17}/><small>Internal ETH</small><strong>{balance ? `${formatWad(balance.wethWad)} ETH` : "—"}</strong></span>
      <span><Crosshair size={17}/><small>Open positions</small><strong>{state?.positions?.length ?? 0}</strong></span>
      <button onClick={() => void refresh()} aria-label="Refresh execution state"><RefreshCw size={16}/></button>
    </section>

    <section className="session-key-grid">
      <article className="session-key-card glass-panel">
        <header><span><Zap size={18}/><strong>Action</strong></span><b>{tradingActionLabel(action).toUpperCase()}</b></header>
        <div className="v23-action-grid">{ACTIONS.map((candidate) => <button key={candidate} className={candidate === action ? "active" : ""} onClick={() => setAction(candidate)}>{tradingActionLabel(candidate)}</button>)}</div>
        <KeyButton onClick={connect} disabled={busy === "connect"}>{account ? "Reconnect wallet" : "Connect trading wallet"}</KeyButton>
      </article>

      <article className="session-key-card glass-panel">
        <header><span><Crosshair size={18}/><strong>Order controls</strong></span><b>MAX 20×</b></header>
        {!isClose(action) && <label><span>{action === TradingAction.SpotSell ? "Tokens to sell" : "Collateral / buy ETH"}</span><input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal"/><b>{action === TradingAction.SpotSell ? "TOKENS" : "ETH"}</b></label>}
        {(action === TradingAction.OpenLong || action === TradingAction.OpenShort) && <label><span>Leverage</span><input value={leverage} onChange={(event) => setLeverage(event.target.value)} inputMode="decimal"/><b>×</b></label>}
        {isClose(action) && <><label><span>Position</span><select value={positionId} onChange={(event) => setPositionId(event.target.value)}>{(state?.positions ?? []).map((position) => <option value={position.id} key={position.id}>{position.leverage}× {position.direction.toUpperCase()} · {position.notional.toFixed(4)} ETH</option>)}</select></label><label><span>Close fraction</span><input value={fraction} onChange={(event) => setFraction(event.target.value)} inputMode="decimal"/><b>%</b></label></>}
        <KeyButton onClick={() => void execute()} disabled={!healthy || busy === "execute"}><Zap size={16}/>{busy === "execute" ? "Signing + settling…" : `Execute ${tradingActionLabel(action)}`}</KeyButton>
      </article>

      <article className="session-key-card glass-panel">
        <header><span><ShieldCheck size={18}/><strong>BattlePool solvency</strong></span><b>{state?.engine?.badDebtEth ? "CHECK" : "ZERO BAD DEBT"}</b></header>
        <div className="session-key-mini-ledger"><span><small>Real pool WETH</small><strong>{state?.engine ? `${state.engine.realWethBalance.toFixed(5)} ETH` : "—"}</strong></span><span><small>Free WETH</small><strong>{state?.engine ? `${state.engine.freeWeth.toFixed(5)} ETH` : "—"}</strong></span><span><small>Position reserve</small><strong>{state?.engine ? `${state.engine.reservedPositionEquity.toFixed(5)} ETH` : "—"}</strong></span><span><small>Liquidation equity</small><strong>{state?.engine ? `${state.engine.liquidationEquityEth.toFixed(5)} ETH` : "—"}</strong></span></div>
        <KeyButton tone="red" onClick={() => void liquidate()} disabled={busy === "liquidate"}><Skull size={16}/>{busy === "liquidate" ? "Resolving…" : "Run keeper liquidation"}</KeyButton>
      </article>
    </section>

    {last && <section className="sponsored-trade-card glass-panel"><div className="sponsored-trade-copy"><span className="eyebrow">LATEST AUTHORITATIVE FILL</span><h2>{last.actionLabel}</h2><p>Frame #{last.sequence} · {last.executionSteps} internal boundary step(s) · {last.liquidationCount} liquidation(s).</p></div><div className="sponsored-trade-metrics"><span><Zap size={16}/><small>Sequencer</small><strong>{last.sequencerLatencyMs.toFixed(2)} ms</strong></span><span><Activity size={16}/><small>Chain finality</small><strong>{last.chainFinalityMs.toFixed(2)} ms</strong></span><span><Crosshair size={16}/><small>Price impact</small><strong>{(Number(last.priceImpactBps) / 100).toFixed(2)}%</strong></span><span><ShieldCheck size={16}/><small>Transaction</small><strong>{shortHash(last.transactionHash)}</strong></span></div></section>}

    {notice && <section className="session-key-notice glass-panel">{notice}</section>}
    <section className="local-chain-warning glass-panel"><ShieldCheck size={21}/><span><strong>Local V23 execution prototype</strong><small>This proves the full no-popup action path and ordered custody deltas. Production deployment still requires fixed-point on-chain pricing, hardened key storage, redundant sequencers, Robinhood Chain testing, and independent audits.</small></span></section>
  </main></>;
}
