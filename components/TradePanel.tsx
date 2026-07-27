"use client";

import {
  ArrowDownRight,
  ArrowUpRight,
  BookmarkPlus,
  ChevronDown,
  Clock3,
  Gauge,
  Info,
  Save,
  ShoppingBag,
  Sparkles,
  Star,
  Trash2,
  Volume2,
  X,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import type { Direction, Token, TradePreset } from "@/lib/types";
import { money } from "@/lib/format";
import { KeyButton } from "./KeyButton";
import { SentimentBar } from "./SentimentBar";
import { TokenAvatar } from "./TokenAvatar";
import { hasLocalV45Session } from "@/lib/chain/v45-terminal-executor";
import { useMarkets } from "./MarketProvider";

const AMOUNT_PRESETS = [0.01, 0.025, 0.05, 0.1];
const LEVERAGE_PRESETS = [2, 5, 10, 20];
type OrderMode = "market" | "limit" | "trigger";

export function TradePanel({ token, variant = "full", onClose, presetSide, presetCollateral = 0.05, presetLeverage = 10, executionPresetLabel }: { token: Token; variant?: "full" | "quick"; onClose?: () => void; presetSide?: Direction; presetCollateral?: number; presetLeverage?: number; executionPresetLabel?: string }) {
  const params = useSearchParams();
  const {
    openPosition,
    buySpot,
    placeOrder,
    cancelOrder,
    pendingOrders,
    tradePresets,
    saveTradePreset,
    deleteTradePreset,
    connected,
    toggleWallet,
    balanceEth,
    walletAddress,
    walletBalanceEth,
    chainExecution,
    watchlist,
    toggleWatchlist,
    getTradeQuote,
    getMarketRisk,
    traderProgress,
  } = useMarkets();
  const requestedSide = params.get("side");
  const initialSide: Direction = presetSide ?? (requestedSide === "buy" || requestedSide === "short" || requestedSide === "long" ? requestedSide : "long");
  const [side, setSide] = useState<Direction>(initialSide);
  const [orderMode, setOrderMode] = useState<OrderMode>("market");
  const [leverage, setLeverage] = useState(presetLeverage);
  const [collateral, setCollateral] = useState(presetCollateral);
  const [advanced, setAdvanced] = useState(false);
  const [takeProfitPercent, setTakeProfitPercent] = useState(25);
  const [stopLossPercent, setStopLossPercent] = useState(8);
  const [breakevenEnabled, setBreakevenEnabled] = useState(true);
  const [breakevenActivationPercent, setBreakevenActivationPercent] = useState(12);
  const [triggerCap, setTriggerCap] = useState(token.markCap ?? token.cap);
  const [toast, setToast] = useState("");
  const [sound, setSound] = useState(true);
  const watched = watchlist.includes(token.slug);
  const quick = variant === "quick";
  const risk = getMarketRisk(token);
  const activeLeverage = Math.min(leverage, Math.max(2, risk.maxLeverage));
  const quote = getTradeQuote(token, side === "short" ? "short" : "long", activeLeverage, collateral);
  const notional = side === "buy" ? collateral : quote.notionalEth;
  const spotFee = collateral * 0.003;
  const fee = side === "buy" ? spotFee : quote.feeEth;
  const takeProfitCap = side === "long" ? quote.markCap * (1 + takeProfitPercent / 100) : quote.markCap * (1 - takeProfitPercent / 100);
  const stopLossCap = side === "long" ? quote.markCap * (1 - stopLossPercent / 100) : quote.markCap * (1 + stopLossPercent / 100);
  const breakevenActivationCap = side === "long" ? quote.markCap * (1 + breakevenActivationPercent / 100) : quote.markCap * (1 - breakevenActivationPercent / 100);
  const cta = orderMode === "market"
    ? side === "buy" ? `BUY ${token.symbol}` : `OPEN ${activeLeverage}× ${side.toUpperCase()}`
    : `PLACE ${orderMode.toUpperCase()} ${side.toUpperCase()}`;
  const buttonTone = side === "short" ? "red" : "green";
  const capacityUsed = side === "buy" || !Number.isFinite(quote.capacityEth) ? 0 : Math.min(100, quote.notionalEth / Math.max(quote.capacityEth, 0.0001) * 100);
  const v45AccountExecution = token.chainDeploymentMode === "anvil-v45" && Boolean(token.chainMarketAddress);
  const v54SpotExecution = (token.chainDeploymentMode === "robinhood-testnet-v54" || token.chainDeploymentMode === "robinhood-mainnet-v54") && Boolean(token.chainMarketAddress);
  const sessionExecution = v45AccountExecution && hasLocalV45Session();
  const contractExecution = (token.chainDeploymentMode === "anvil-v43" || v45AccountExecution || v54SpotExecution) && Boolean(token.chainMarketAddress);
  const durableOrderExecution = sessionExecution;
  const availableBalance = v45AccountExecution ? balanceEth : contractExecution ? walletBalanceEth : balanceEth;
  const executionBusy = contractExecution && chainExecution.slug === token.slug && (chainExecution.phase === "wallet" || chainExecution.phase === "pending");
  const insufficient = contractExecution && !v45AccountExecution && !walletAddress ? false : collateral + fee > availableBalance;
  const tokenOrders = pendingOrders.filter((order) => order.slug === token.slug);

  const suggestedTrigger = (mode: OrderMode, nextSide: Direction) => {
    const base = token.markCap ?? token.cap;
    if (mode === "market") return base;
    const lower = nextSide === "buy" || nextSide === "long";
    const multiplier = mode === "limit" ? (lower ? 0.95 : 1.05) : (lower ? 1.05 : 0.95);
    return Math.max(1, Math.round(base * multiplier));
  };

  const selectOrderMode = (mode: OrderMode) => {
    setOrderMode(mode);
    if (mode !== "market") setTriggerCap(suggestedTrigger(mode, side));
  };

  const selectSide = (nextSide: Direction) => {
    setSide(nextSide);
    if (orderMode !== "market") setTriggerCap(suggestedTrigger(orderMode, nextSide));
  };

  const rows = useMemo(() => side === "buy" ? [
    [orderMode === "market" ? "Spot purchase" : "Order amount", `${collateral.toFixed(3)} ETH`],
    [orderMode === "market" ? "Pool price" : "Trigger market cap", money(orderMode === "market" ? token.cap : triggerCap)],
    ["BattlePool execution fee", `${spotFee.toFixed(5)} ETH`],
    ["Liquidity locked", `${(token.liquidityEth ?? 0).toFixed(2)} ETH`],
  ] : [
    ["Position size", `${notional.toFixed(3)} ETH`],
    [orderMode === "market" ? "Mark / index" : "Trigger market cap", orderMode === "market" ? `${money(quote.markCap)} / ${money(quote.indexCap)}` : money(triggerCap)],
    ["Liquidation MC", money(quote.liquidationCap)],
    ["Liquidation distance", `${quote.liquidationDistancePercent.toFixed(2)}%`],
    ["Maintenance margin", `${quote.maintenanceMarginEth.toFixed(4)} ETH`],
    ["Price impact", `${quote.priceImpactPercent.toFixed(3)}%`],
    ["BattlePool execution fee", `${quote.feeEth.toFixed(5)} ETH`],
  ], [collateral, notional, orderMode, quote, side, spotFee, token.cap, token.liquidityEth, triggerCap]);

  const notify = (message: string, duration = 3000) => {
    setToast(message);
    window.setTimeout(() => setToast(""), duration);
  };

  const playFill = () => {
    if (!sound) return;
    try {
      const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextCtor) return;
      const context = new AudioContextCtor();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(side === "short" ? 260 : 420, context.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(side === "short" ? 180 : 680, context.currentTime + 0.12);
      gain.gain.setValueAtTime(0.0001, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.08, context.currentTime + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.15);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.16);
    } catch {
      // Audio feedback is optional.
    }
    navigator.vibrate?.(22);
  };

  const submit = async () => {
    if (!connected && !contractExecution) {
      toggleWallet();
      notify("Wallet connected. Review the order and submit again.");
      return;
    }
    try {
      if (orderMode !== "market") {
        await placeOrder({
          slug: token.slug,
          side,
          kind: orderMode,
          leverage: side === "buy" ? 1 : activeLeverage,
          collateral,
          triggerCap,
          takeProfitCap: advanced && side !== "buy" ? takeProfitCap : undefined,
          stopLossCap: advanced && side !== "buy" ? stopLossCap : undefined,
        });
        notify(`${orderMode === "limit" ? "Limit" : "Trigger"} order armed at ${money(triggerCap)}.`);
        return;
      }
      if (side === "buy") {
        const holding = await buySpot(token.slug, collateral);
        playFill();
        notify(contractExecution ? `On-chain buy confirmed${holding.chainBlockNumber ? ` in block ${holding.chainBlockNumber}` : ""}.` : `Bought ${collateral.toFixed(3)} ETH of ${token.symbol}. Spot position added.`);
      } else {
        if (!quote.allowed) throw new Error(quote.reason ?? "Trade blocked by Risk Engine V1.");
        const position = await openPosition(token.slug, side, activeLeverage, collateral, (!contractExecution || sessionExecution) && advanced ? { takeProfitCap, stopLossCap, breakevenCap: breakevenEnabled ? quote.markCap : undefined, breakevenActivationCap: breakevenEnabled ? breakevenActivationCap : undefined } : undefined);
        playFill();
        notify(contractExecution ? `Position #${position.chainPositionId ?? position.id} confirmed on-chain.` : `${activeLeverage}× ${side} opened. Mark-price protection is active.`);
      }
    } catch (error) {
      notify(error instanceof Error ? error.message : "Trade could not be opened.", 4200);
    }
  };

  const applyPreset = (preset: TradePreset) => {
    setSide(preset.side);
    setLeverage(preset.leverage);
    setCollateral(Math.min(preset.collateral, Math.max(0.001, availableBalance - 0.001)));
    setTakeProfitPercent(preset.takeProfitPercent);
    setStopLossPercent(preset.stopLossPercent);
    setAdvanced(true);
    notify(`${preset.name} loaded.`);
  };

  const saveCurrentPreset = () => {
    saveTradePreset({
      name: "CUSTOM",
      side,
      leverage: side === "buy" ? 1 : activeLeverage,
      collateral,
      takeProfitPercent,
      stopLossPercent,
    });
    notify("Custom quick-trade preset saved.");
  };

  return (
    <aside className={`trade-panel terminal-trade-panel glass-panel ${quick ? "quick-variant" : ""}`}>
      <div className="trade-panel-heading">
        <div className="trade-token-mini"><TokenAvatar token={token} size="sm" /><span><small>{quick ? "QUICK TRADE" : "TRADE"}{executionPresetLabel ? ` · ${executionPresetLabel}` : ""}</small><strong>{token.symbol}/WETH</strong></span></div>
        <div className="trade-heading-actions">
          <button onClick={() => setSound((value) => !value)} className={sound ? "active" : ""} aria-label="Toggle fill sound"><Volume2 size={15} /></button>
          <button onClick={() => toggleWatchlist(token.slug)} className={watched ? "active" : ""} aria-label="Watch token"><Star size={16} fill={watched ? "currentColor" : "none"} /></button>
          {onClose && <button onClick={onClose} aria-label="Close quick trade"><X size={18} /></button>}
        </div>
      </div>

      <div className="trader-progress-mini"><Sparkles size={14} /><span><b>LVL {traderProgress.level}</b>{traderProgress.title}</span><em>{traderProgress.streak > 1 ? `${traderProgress.streak} win streak` : `${traderProgress.xp} XP`}</em></div>

      <div className="trade-preset-strip">
        {tradePresets.map((preset) => <button key={preset.id} onClick={() => applyPreset(preset)}><span>{preset.name}</span><small>{preset.side === "buy" ? "SPOT" : `${preset.leverage}× ${preset.side.toUpperCase()}`} · {preset.collateral}Ξ</small>{preset.id.startsWith("custom-") && <i onClick={(event) => { event.stopPropagation(); deleteTradePreset(preset.id); }}><Trash2 size={11} /></i>}</button>)}
        <button className="save-preset" onClick={saveCurrentPreset}><Save size={13} /><span>SAVE</span></button>
      </div>

      <div className="trade-order-modes">
        <button className={orderMode === "market" ? "active" : ""} onClick={() => selectOrderMode("market")}><Zap size={13} />Market</button>
        <button disabled={contractExecution && !durableOrderExecution} className={orderMode === "limit" ? "active" : ""} onClick={() => selectOrderMode("limit")}><BookmarkPlus size={13} />Limit</button>
        <button disabled={contractExecution && !durableOrderExecution} className={orderMode === "trigger" ? "active" : ""} onClick={() => selectOrderMode("trigger")}><Clock3 size={13} />Trigger</button>
      </div>

      <div className="trade-tabs">
        <button className={side === "buy" ? "active buy" : ""} onClick={() => selectSide("buy")}><ShoppingBag size={15} />Buy</button>
        <button disabled={v54SpotExecution} className={side === "long" ? "active long" : ""} onClick={() => selectSide("long")}><ArrowUpRight size={15} />Long</button>
        <button disabled={v54SpotExecution} className={side === "short" ? "active short" : ""} onClick={() => selectSide("short")}><ArrowDownRight size={15} />Short</button>
      </div>

      {side !== "buy" && <>
        <div className="ticket-row-label"><span>Leverage</span><small>Live limit: <b>{risk.maxLeverage > 1 ? `${risk.maxLeverage}×` : "spot only"}</b></small></div>
        <div className="leverage-keys">
          {LEVERAGE_PRESETS.map((value) => {
            const locked = value > risk.maxLeverage;
            return <button key={value} disabled={locked} title={locked ? "Unlocks when oracle, liquidity, and distribution qualify" : `${value}× leverage`} className={activeLeverage === value ? "active" : ""} onClick={() => setLeverage(value)}>{value}×{locked && <i>LOCK</i>}</button>;
          })}
        </div>
        <div className={`risk-ticket-callout ${risk.label.toLowerCase().replaceAll(" ", "-")}`}><ShieldIcon /><span><b>{risk.label} · {risk.score.toFixed(0)}/100</b><small>{risk.reasons[0]}</small></span><em>{risk.oracleConfidence.toFixed(0)}% oracle</em></div>
      </>}

      {(!contractExecution || durableOrderExecution) && orderMode !== "market" && <label className="trade-trigger-box"><span>{orderMode === "limit" ? "Limit market cap" : "Trigger market cap"}</span><div><b>$</b><input type="number" min="1" step="100" value={Math.round(triggerCap)} onChange={(event) => setTriggerCap(Math.max(1, Number(event.target.value)))} /></div><small>Live mark {money(token.markCap ?? token.cap)} · fills when crossed</small></label>}

      <label className="trade-amount-box">
        <span>{side === "buy" ? "Spend" : "Collateral"}</span>
        <div><input type="number" min="0.001" step="0.005" value={collateral} onChange={(event) => setCollateral(Math.max(0, Number(event.target.value)))} /><strong>ETH</strong><ChevronDown size={14} /></div>
        <small>Available {availableBalance.toFixed(4)} ETH{contractExecution && !v45AccountExecution && walletAddress ? ` · ${walletAddress.slice(0, 6)}…${walletAddress.slice(-4)}` : ""}</small>
      </label>
      <div className="quick-amount-presets">{AMOUNT_PRESETS.map((amount) => <button key={amount} className={collateral === amount ? "active" : ""} onClick={() => setCollateral(Math.min(amount, availableBalance))}>{amount} ETH</button>)}<button onClick={() => setCollateral(Math.max(0.001, availableBalance - 0.002))}>MAX</button></div>

      {side !== "buy" && <div className="capacity-meter"><span><b>{side.toUpperCase()} CAPACITY</b><small>{quote.capacityEth.toFixed(3)} ETH available</small></span><i><em style={{ width: `${capacityUsed}%` }} /></i><strong className={capacityUsed > 90 ? "negative" : ""}>{capacityUsed.toFixed(0)}%</strong></div>}

      <div className="trade-estimates">{rows.map(([label, value]) => <span key={label}><small>{label}</small><strong>{value}</strong></span>)}</div>

      {side !== "buy" && <div className="trade-carry-grid">
        <span><small>Funding / hour</small><strong className={quote.fundingRateHourly >= 0 ? "negative" : "positive"}>{quote.fundingRateHourly >= 0 ? "+" : ""}{quote.fundingRateHourly.toFixed(4)}%</strong></span>
        <span><small>Borrow / hour</small><strong>{quote.borrowRateHourly.toFixed(4)}%</strong></span>
        <span><small>Execution</small><strong className={quote.balancingRebate ? "positive" : ""}>{quote.balancingRebate ? "Rebate side" : "Crowded side"}</strong></span>
      </div>}

      {(!contractExecution || durableOrderExecution) && orderMode === "market" && side !== "buy" && <button className="advanced-toggle" onClick={() => setAdvanced((value) => !value)}><span><Gauge size={14} />Take profit, stop loss &amp; breakeven</span><ChevronDown size={15} className={advanced ? "open" : ""} /></button>}
      {(!contractExecution || durableOrderExecution) && orderMode === "market" && advanced && side !== "buy" && <div className="advanced-grid"><label><span>Take profit</span><div><input type="number" min="1" value={takeProfitPercent} onChange={(event) => setTakeProfitPercent(Math.max(1, Number(event.target.value)))} /><b>%</b></div><small>{money(takeProfitCap)}</small></label><label><span>Stop loss</span><div><input type="number" min="1" value={stopLossPercent} onChange={(event) => setStopLossPercent(Math.max(1, Number(event.target.value)))} /><b>%</b></div><small>{money(stopLossCap)}</small></label><label className="v46-breakeven"><span><input type="checkbox" checked={breakevenEnabled} onChange={(event) => setBreakevenEnabled(event.target.checked)} /> Breakeven</span><div><input type="number" min="1" value={breakevenActivationPercent} onChange={(event) => setBreakevenActivationPercent(Math.max(1, Number(event.target.value)))} /><b>% arm</b></div><small>Retrace to {money(quote.markCap)}</small></label></div>}

      {contractExecution && <div className={`v44-execution-strip ${chainExecution.slug === token.slug ? chainExecution.phase : "idle"}`}><span><b>{v54SpotExecution ? "V54 ROBINHOOD SPOT" : sessionExecution ? orderMode === "market" ? "V45 AUTHORIZED EXECUTION" : "V46 DURABLE KEEPER ORDER" : "V44 CONTRACT EXECUTION"}</b><small>{chainExecution.slug === token.slug && chainExecution.message ? chainExecution.message : v54SpotExecution ? "Connected-wallet settlement against the real Robinhood Chain bonding curve." : sessionExecution ? "P-256 intent · on-chain nonce and limits · sponsored sequencer." : "Wallet-confirmed settlement against the shared V43 BattlePool."}</small></span><em>{sessionExecution ? "SESSION" : walletAddress ? `${walletAddress.slice(0, 6)}…${walletAddress.slice(-4)}` : "connect on trade"}</em></div>}

      {side !== "buy" && !quote.allowed && orderMode === "market" && <div className="trade-block-reason"><Info size={15} /><span><b>Risk engine limit</b><small>{quote.reason}</small></span></div>}
      {insufficient && <div className="trade-block-reason"><Info size={15} /><span><b>Insufficient trading balance</b><small>Reduce collateral, deposit funds, or close another position.</small></span></div>}

      <KeyButton className="trade-submit" tone={buttonTone} onClick={() => void submit()} disabled={executionBusy || insufficient || (v54SpotExecution && side !== "buy") || (side !== "buy" && orderMode === "market" && !quote.allowed)}><Zap size={17} />{executionBusy ? "AWAITING CONFIRMATION" : contractExecution || connected ? cta : "CONNECT WALLET"}</KeyButton>

      {tokenOrders.length > 0 && <div className="ticket-open-orders"><div><strong>OPEN ORDERS</strong><span>{tokenOrders.length}</span></div>{tokenOrders.slice(0, 4).map((order) => <article key={order.id}><span><b className={order.side === "short" ? "negative" : "positive"}>{order.side.toUpperCase()}</b><small>{order.kind} · {order.side === "buy" ? "spot" : `${order.leverage}×`} · {order.collateral} ETH</small></span><em>{money(order.triggerCap)}</em><button onClick={() => cancelOrder(order.id)}><X size={13} /></button></article>)}</div>}

      <div className="trade-footer-links"><Link href="/positions">View positions</Link><span>•</span><Link href="/leaderboard">Trader leaderboard</Link></div>
      <SentimentBar longs={token.longs} />
      {toast && <div className={`ticket-toast ${toast.includes("opened") || toast.includes("Bought") || toast.includes("armed") ? "success" : ""}`}>{toast}</div>}
    </aside>
  );
}

function ShieldIcon() {
  return <span className="shield-mini">P</span>;
}
