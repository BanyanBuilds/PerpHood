"use client";

import { AlertTriangle, ChevronDown, Gauge, Info, ShieldCheck, Settings2, Zap } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { money } from "@/lib/format";
import { DEMO_HOLDER_INTEL, isDemoMarket } from "@/lib/demo-market";
import type { Direction, Token } from "@/lib/types";
import { KeyButton } from "./KeyButton";
import { hasLocalV45Session } from "@/lib/chain/v45-terminal-executor";
import { useMarkets } from "./MarketProvider";

type TicketMode = "buy" | "sell" | "long" | "short";
type OrderMode = "market" | "limit" | "trigger";
type FeePreset = "P1" | "P2" | "P3";

const AMOUNTS = [0.01, 0.025, 0.05, 0.1];
const LEVERAGES = [2, 5, 10, 20];

const FEE_PRESETS: Record<FeePreset, { priority: string; slippage: string }> = {
  P1: { priority: "0.01 ETH", slippage: "10%" },
  P2: { priority: "0.03 ETH", slippage: "10%" },
  P3: { priority: "0.10 ETH", slippage: "10%" },
};

export function WorkspaceTradeTicket({ token, requestedMode, requestedAmount, requestedLeverage, version }: {
  token: Token;
  requestedMode: TicketMode;
  requestedAmount: number;
  requestedLeverage: number;
  version: number;
}) {
  const {
    balanceEth,
    walletAddress,
    walletBalanceEth,
    chainExecution,
    buySpot,
    connected,
    getMarketRisk,
    getTradeQuote,
    holdings,
    openPosition,
    placeOrder,
    sellHolding,
    toggleWallet,
  } = useMarkets();
  const [mode, setMode] = useState<TicketMode>(requestedMode);
  const [orderMode, setOrderMode] = useState<OrderMode>("market");
  const [amount, setAmount] = useState(requestedAmount);
  const [leverage, setLeverage] = useState(requestedLeverage);
  const [feePreset, setFeePreset] = useState<FeePreset>("P1");
  const [advanced, setAdvanced] = useState(false);
  const [safetyOpen, setSafetyOpen] = useState(true);
  const [takeProfit, setTakeProfit] = useState(25);
  const [stopLoss, setStopLoss] = useState(8);
  const [breakevenEnabled, setBreakevenEnabled] = useState(true);
  const [breakevenActivation, setBreakevenActivation] = useState(12);
  const [triggerCap, setTriggerCap] = useState(token.markCap ?? token.cap);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    setMode(requestedMode);
    setAmount(requestedAmount);
    setLeverage(requestedLeverage);
  }, [requestedAmount, requestedLeverage, requestedMode, version]);

  useEffect(() => {
    const stored = localStorage.getItem("perphood-v37-fee-preset") as FeePreset | null;
    if (stored && stored in FEE_PRESETS) setFeePreset(stored);
  }, []);

  useEffect(() => {
    localStorage.setItem("perphood-v37-fee-preset", feePreset);
  }, [feePreset]);

  const v45AccountExecution = token.chainDeploymentMode === "anvil-v45" && Boolean(token.chainMarketAddress);
  const sessionExecution = v45AccountExecution && hasLocalV45Session();
  const contractExecution = (token.chainDeploymentMode === "anvil-v43" || v45AccountExecution) && Boolean(token.chainMarketAddress);
  const durableOrderExecution = sessionExecution;
  const availableBalance = v45AccountExecution ? balanceEth : contractExecution ? walletBalanceEth : balanceEth;
  const executionBusy = contractExecution && chainExecution.slug === token.slug && (chainExecution.phase === "wallet" || chainExecution.phase === "pending");
  const risk = getMarketRisk(token);
  const side: Direction = mode === "buy" || mode === "sell" ? "buy" : mode;
  const activeLeverage = Math.min(leverage, Math.max(2, risk.maxLeverage));
  const quote = getTradeQuote(token, mode === "short" ? "short" : "long", activeLeverage, amount);
  const marketHoldings = holdings.filter((holding) => holding.slug === token.slug);
  const totalSpotTokens = marketHoldings.reduce((sum, holding) => sum + (holding.tokenAmount ?? 0), 0);
  const totalSpotInvested = marketHoldings.reduce((sum, holding) => sum + holding.investedEth, 0);
  const fee = mode === "buy" ? amount * 0.003 : mode === "sell" ? 0 : quote.feeEth;
  const insufficient = mode !== "sell" && (contractExecution && !v45AccountExecution && !walletAddress ? false : amount + fee > availableBalance);
  const tpCap = mode === "long" ? quote.markCap * (1 + takeProfit / 100) : quote.markCap * (1 - takeProfit / 100);
  const slCap = mode === "long" ? quote.markCap * (1 - stopLoss / 100) : quote.markCap * (1 + stopLoss / 100);
  const beActivationCap = mode === "long" ? quote.markCap * (1 + breakevenActivation / 100) : quote.markCap * (1 - breakevenActivation / 100);

  const safety = isDemoMarket(token.slug) ? DEMO_HOLDER_INTEL : {
    holders: token.uniqueTraders ?? 0,
    top10Share: token.linkedWalletConcentration ?? 0,
    creatorShare: 0,
    insiders: 0,
    snipers: 0,
    first70Holding: 0,
    bundledShare: 0,
    liquidityProviders: 1,
  };
  const safetyWarnings = [
    safety.top10Share > 25 ? "Concentrated holders" : null,
    safety.creatorShare > 8 ? "High creator holding" : null,
    safety.bundledShare > 10 ? "Bundled supply" : null,
    (token.badDebtEth ?? 0) > 0 ? "BattlePool bad debt" : null,
  ].filter(Boolean);

  const quoteRows = useMemo(() => {
    if (mode === "buy") return [
      ["Execution", money(token.cap)],
      ["Pool fee", `${fee.toFixed(5)} ETH`],
      ["Liquidity", `${(token.liquidityEth ?? 0).toFixed(2)} ETH`],
      ["Pressure", "Real spot buy"],
    ];
    if (mode === "sell") return [
      ["Invested", `${totalSpotInvested.toFixed(4)} ETH`],
      ["Tokens", totalSpotTokens ? totalSpotTokens.toLocaleString(undefined, { maximumFractionDigits: 0 }) : "0"],
      ["Settlement", "Instant WETH"],
      ["Pressure", "Real spot sell"],
    ];
    return [
      ["Position", `${quote.notionalEth.toFixed(3)} ETH`],
      ["Entry MC", money(quote.markCap)],
      ["Liquidation", money(quote.liquidationCap)],
      ["Price impact", `${quote.priceImpactPercent.toFixed(3)}%`],
    ];
  }, [fee, mode, quote, token.cap, token.liquidityEth, totalSpotInvested, totalSpotTokens]);

  const submit = async () => {
    if (!connected && !contractExecution) {
      toggleWallet();
      setNotice("Wallet connected. Review and submit again.");
      return;
    }
    try {
      if (mode === "sell") return;
      if (orderMode !== "market") {
        await placeOrder({
          slug: token.slug,
          side,
          kind: orderMode,
          leverage: mode === "buy" ? 1 : activeLeverage,
          collateral: amount,
          triggerCap,
          takeProfitCap: advanced && mode !== "buy" ? tpCap : undefined,
          stopLossCap: advanced && mode !== "buy" ? slCap : undefined,
        });
        setNotice(`${orderMode} order armed at ${money(triggerCap)}.`);
        return;
      }
      if (mode === "buy") {
        setNotice(sessionExecution ? "Relaying the signed V45 spot-buy intent…" : contractExecution ? "Confirm the V43 spot buy in your wallet…" : "Executing spot buy…");
        const holding = await buySpot(token.slug, amount);
        setNotice(contractExecution ? `Confirmed in block ${holding.chainBlockNumber}.` : `Bought ${amount.toFixed(3)} ETH of ${token.symbol}.`);
        return;
      }
      if (!quote.allowed) throw new Error(quote.reason ?? "Risk engine rejected this route.");
      setNotice(sessionExecution ? `Relaying the signed V45 ${activeLeverage}× ${mode} intent…` : contractExecution ? `Confirm the ${activeLeverage}× ${mode} in your wallet…` : "Opening position…");
      const position = await openPosition(token.slug, mode, activeLeverage, amount, (!contractExecution || sessionExecution) && advanced ? { takeProfitCap: tpCap, stopLossCap: slCap, breakevenCap: breakevenEnabled ? quote.markCap : undefined, breakevenActivationCap: breakevenEnabled ? beActivationCap : undefined } : undefined);
      setNotice(contractExecution ? `Position #${position.chainPositionId} confirmed in block ${position.chainBlockNumber}.` : `${activeLeverage}× ${mode} opened.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Trade could not be executed.");
    }
  };

  const sellAcrossHoldings = async (fraction: number) => {
    try {
      setNotice(sessionExecution ? "Relaying the signed V45 spot-sell intent…" : contractExecution ? "Approve if needed, then confirm the V43 sell…" : "Selling spot position…");
      for (const holding of marketHoldings) await sellHolding(holding.id, fraction);
      setNotice(`Sold ${(fraction * 100).toFixed(0)}% of the ${token.symbol} spot position.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Spot sell failed.");
    }
  };

  const cta = mode === "buy" ? `Buy ${token.symbol}` : mode === "sell" ? `Sell ${token.symbol}` : `Open ${activeLeverage}× ${mode}`;
  const disabled = executionBusy || insufficient || (mode !== "buy" && mode !== "sell" && orderMode === "market" && !quote.allowed) || (mode === "sell" && !marketHoldings.length);

  return <aside className="v37-trade-ticket">
    <div className="v37-ticket-presets">
      <span>{(["P1", "P2", "P3"] as FeePreset[]).map((preset) => <button type="button" key={preset} className={feePreset === preset ? "active" : ""} onClick={() => setFeePreset(preset)}>{preset}</button>)}</span>
      <button type="button" className="v37-fee-summary" onClick={() => setAdvanced((value) => !value)}><Settings2 size={14} />{FEE_PRESETS[feePreset].priority} · {FEE_PRESETS[feePreset].slippage}</button>
    </div>

    <div className="v37-side-tabs">
      {(["buy", "sell", "long", "short"] as TicketMode[]).map((item) => <button type="button" key={item} className={`${mode === item ? "active" : ""} ${item}`} onClick={() => { setMode(item); if (item === "sell") setOrderMode("market"); }}>{item}</button>)}
    </div>

    <div className="v37-order-line">
      <label><span>Order</span><select value={orderMode} disabled={mode === "sell" || (contractExecution && !durableOrderExecution)} onChange={(event) => setOrderMode(event.target.value as OrderMode)}><option value="market">Market</option><option value="limit">Limit</option><option value="trigger">Trigger</option></select></label>
      <span><small>{v45AccountExecution ? "V45 account" : contractExecution ? "Wallet" : "Balance"}</small><strong>{contractExecution && !v45AccountExecution && !walletAddress ? "Connect on trade" : `${availableBalance.toFixed(4)} ETH`}</strong></span>
    </div>

    {mode !== "sell" ? <>
      {(!contractExecution || durableOrderExecution) && orderMode !== "market" && <label className="v37-trigger-input"><span>Trigger market cap</span><div><b>$</b><input type="number" value={Math.round(triggerCap)} onChange={(event) => setTriggerCap(Math.max(1, Number(event.target.value)))} /></div></label>}
      <label className="v37-amount-input"><span>{mode === "buy" ? "Spend" : "Collateral"}</span><div><input type="number" min="0.001" step="0.005" value={amount} onChange={(event) => setAmount(Math.max(0, Number(event.target.value)))} /><b>ETH</b></div></label>
      <div className="v37-amount-presets">{AMOUNTS.map((value) => <button type="button" key={value} className={amount === value ? "active" : ""} onClick={() => setAmount(value)}>{value}</button>)}<button type="button" onClick={() => setAmount(Math.max(0.001, availableBalance - 0.002))}>Max</button></div>
    </> : <div className="v37-sell-position"><span><small>Spot invested</small><strong>{totalSpotInvested.toFixed(4)} ETH</strong></span><span><small>Token balance</small><strong>{totalSpotTokens.toLocaleString(undefined, { maximumFractionDigits: 0 })}</strong></span><div>{[.25,.5,.75,1].map((fraction) => <button type="button" key={fraction} onClick={() => void sellAcrossHoldings(fraction)}>{fraction === 1 ? "Sell all" : `${fraction * 100}%`}</button>)}</div></div>}

    {(mode === "long" || mode === "short") && <div className="v37-leverage"><span><b>Leverage</b><small>Maximum {risk.maxLeverage}×</small></span><div>{LEVERAGES.map((value) => <button type="button" key={value} disabled={value > risk.maxLeverage} className={activeLeverage === value ? "active" : ""} onClick={() => setLeverage(value)}>{value}×</button>)}</div></div>}

    <div className="v37-quote-grid">{quoteRows.map(([label, value]) => <span key={label}><small>{label}</small><strong>{value}</strong></span>)}</div>

    {(!contractExecution || durableOrderExecution) && orderMode === "market" && (mode === "long" || mode === "short") && <button type="button" className="v37-advanced-toggle" onClick={() => setAdvanced((value) => !value)}><span><Gauge size={14} />TP / SL / BE</span><ChevronDown size={15} className={advanced ? "open" : ""} /></button>}
    {(!contractExecution || durableOrderExecution) && orderMode === "market" && advanced && (mode === "long" || mode === "short") && <div className="v37-tpsl"><label><span>Take profit</span><div><input type="number" value={takeProfit} onChange={(event) => setTakeProfit(Math.max(1, Number(event.target.value)))} /><b>%</b></div><small>{money(tpCap)}</small></label><label><span>Stop loss</span><div><input type="number" value={stopLoss} onChange={(event) => setStopLoss(Math.max(1, Number(event.target.value)))} /><b>%</b></div><small>{money(slCap)}</small></label><label className="v46-breakeven"><span><input type="checkbox" checked={breakevenEnabled} onChange={(event) => setBreakevenEnabled(event.target.checked)} /> Breakeven</span><div><input type="number" value={breakevenActivation} onChange={(event) => setBreakevenActivation(Math.max(1, Number(event.target.value)))} /><b>% arm</b></div><small>Retrace to {money(quote.markCap)}</small></label></div>}

    {mode !== "buy" && mode !== "sell" && <p className="v37-risk-note"><Info size={14} /><span><b>{risk.label} · {risk.score.toFixed(0)}/100</b><small>{quote.allowed ? `${quote.liquidationDistancePercent.toFixed(2)}% to liquidation` : quote.reason}</small></span></p>}

    <section className={`v37-token-safety ${safetyOpen ? "open" : ""}`}>
      <button type="button" className="v37-safety-head" onClick={() => setSafetyOpen((value) => !value)}>
        <span>{safetyWarnings.length ? <AlertTriangle size={15} /> : <ShieldCheck size={15} />}<b>Token safety</b><small>{safetyWarnings.length ? `${safetyWarnings.length} warning${safetyWarnings.length === 1 ? "" : "s"}` : "Checks look healthy"}</small></span>
        <ChevronDown size={15} className={safetyOpen ? "open" : ""} />
      </button>
      {safetyOpen && <div className="v37-safety-grid">
        <span><small>Top 10</small><strong className={safety.top10Share > 25 ? "warning" : ""}>{safety.top10Share.toFixed(1)}%</strong></span>
        <span><small>Dev holding</small><strong className={safety.creatorShare > 8 ? "warning" : ""}>{safety.creatorShare.toFixed(1)}%</strong></span>
        <span><small>Insiders</small><strong>{safety.insiders}</strong></span>
        <span><small>Bundles</small><strong className={safety.bundledShare > 10 ? "warning" : ""}>{safety.bundledShare.toFixed(1)}%</strong></span>
        <span><small>Snipers</small><strong>{safety.snipers}</strong></span>
        <span><small>Fresh buyers</small><strong>{safety.holders.toLocaleString()}</strong></span>
        <span><small>Mint authority</small><strong className="positive">Off</strong></span>
        <span><small>Freeze authority</small><strong className="positive">Off</strong></span>
        <span><small>Liquidity</small><strong className="positive">BattlePool</strong></span>
      </div>}
    </section>

    <KeyButton className="v37-submit" tone={mode === "sell" || mode === "short" ? "red" : "green"} disabled={disabled} onClick={mode === "sell" ? () => void sellAcrossHoldings(1) : () => void submit()}><Zap size={17} />{executionBusy ? sessionExecution ? "Relaying intent…" : "Awaiting wallet…" : connected || contractExecution ? cta : "Connect wallet"}</KeyButton>
    <div className="v37-ticket-foot"><span>Fee {feePreset}</span><span>MEV guard on</span><span>One BattlePool</span></div>
    {contractExecution && <div className={`v44-execution-strip ${chainExecution.phase}`}><span><b>{sessionExecution ? orderMode === "market" ? "V45 SESSION" : "V46 KEEPER ORDER" : "V43 CONTRACT"}</b><small>{sessionExecution ? `Sponsored sequencer · seq ${token.chainStateSequence ?? "—"}` : walletAddress ? `${walletAddress.slice(0, 6)}…${walletAddress.slice(-4)} · seq ${token.chainStateSequence ?? "—"}` : "Wallet connects on first trade"}</small></span><em>{chainExecution.slug === token.slug ? chainExecution.phase.toUpperCase() : "READY"}</em></div>}
    {notice && <div className="v37-ticket-notice">{notice}</div>}
  </aside>;
}
