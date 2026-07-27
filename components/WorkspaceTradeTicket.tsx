"use client";

import { AlertTriangle, ChevronDown, Gauge, Info, ShieldCheck, Settings2, Zap } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { money } from "@/lib/format";
import type { Direction, Token } from "@/lib/types";
import { KeyButton } from "./KeyButton";
import { hasLocalV45Session } from "@/lib/chain/v45-terminal-executor";
import { useMarkets } from "./MarketProvider";

type TicketMode = "buy" | "sell" | "long" | "short";
type OrderMode = "market" | "limit" | "trigger";
type FeePreset = "P1" | "P2" | "P3";

const AMOUNTS = [0.01, 0.025, 0.05, 0.1];
const LEVERAGES = [2, 5, 10, 20];

const FEE_PRESETS: Record<FeePreset, { maxNetworkFeeEth: number; slippagePercent: number; route: "Standard" | "Fast" | "Assault" }> = {
  P1: { maxNetworkFeeEth: 0.00002, slippagePercent: 3, route: "Standard" },
  P2: { maxNetworkFeeEth: 0.00005, slippagePercent: 6, route: "Fast" },
  P3: { maxNetworkFeeEth: 0.0001, slippagePercent: 12, route: "Assault" },
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
    const stored = (localStorage.getItem("leveragex-v55-fee-preset") ?? localStorage.getItem("perphood-v37-fee-preset")) as FeePreset | null;
    if (stored && stored in FEE_PRESETS) setFeePreset(stored);
  }, []);

  useEffect(() => {
    localStorage.setItem("leveragex-v55-fee-preset", feePreset);
  }, [feePreset]);

  const v45AccountExecution = token.chainDeploymentMode === "anvil-v45" && Boolean(token.chainMarketAddress);
  const v54SpotExecution = (token.chainDeploymentMode === "robinhood-testnet-v54" || token.chainDeploymentMode === "robinhood-mainnet-v54" || token.chainDeploymentMode === "robinhood-testnet-v55" || token.chainDeploymentMode === "robinhood-mainnet-v55") && Boolean(token.chainMarketAddress);
  const leverageXNative = token.chainDeploymentMode === "robinhood-testnet-v55" || token.chainDeploymentMode === "robinhood-mainnet-v55";
  const syncAgeSeconds = token.chainLastSyncedAt ? Math.max(0, Math.floor((Date.now() - token.chainLastSyncedAt) / 1000)) : null;
  const marketState = token.battlePhase === "paused" ? "PAUSED" : syncAgeSeconds === null ? "INDEXING" : syncAgeSeconds > 45 ? "STALE" : "ACTIVE";
  const sessionExecution = v45AccountExecution && hasLocalV45Session();
  const contractExecution = (token.chainDeploymentMode === "anvil-v43" || v45AccountExecution || v54SpotExecution) && Boolean(token.chainMarketAddress);
  const durableOrderExecution = sessionExecution;
  const availableBalance = v45AccountExecution ? balanceEth : contractExecution ? walletBalanceEth : balanceEth;
  const executionBusy = contractExecution && chainExecution.slug === token.slug && (chainExecution.phase === "wallet" || chainExecution.phase === "pending");
  const selectedExecution = FEE_PRESETS[feePreset];
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

  const safety = {
    holders: token.uniqueTraders,
    top10Share: token.linkedWalletConcentration,
    liquidityProviders: token.chainMarketAddress ? 1 : undefined,
  };
  const safetyWarnings = [
    typeof safety.top10Share === "number" && safety.top10Share > 25 ? "Concentrated linked-wallet evidence" : null,
    (token.badDebtEth ?? 0) > 0 ? "BattlePool bad debt" : null,
    marketState === "STALE" ? "Market data is stale" : null,
    marketState === "PAUSED" ? "Market is paused" : null,
  ].filter(Boolean);

  const quoteRows = useMemo(() => {
    if (mode === "buy") return [
      ["Current MC", money(token.cap)],
      ["Protocol fee", `${fee.toFixed(6)} ETH`],
      ["Max network", `${selectedExecution.maxNetworkFeeEth.toFixed(6)} ETH`],
      ["Max debit", `${(amount + fee + selectedExecution.maxNetworkFeeEth).toFixed(6)} ETH`],
      ["Slippage", `${selectedExecution.slippagePercent}%`],
      ["Route", selectedExecution.route],
    ];
    if (mode === "sell") return [
      ["Invested", `${totalSpotInvested.toFixed(4)} ETH`],
      ["Tokens", totalSpotTokens ? totalSpotTokens.toLocaleString(undefined, { maximumFractionDigits: 0 }) : "0"],
      ["Max network", `${selectedExecution.maxNetworkFeeEth.toFixed(6)} ETH`],
      ["Slippage", `${selectedExecution.slippagePercent}%`],
      ["Route", selectedExecution.route],
      ["Pressure", "Real spot sell"],
    ];
    return [
      ["Position", `${quote.notionalEth.toFixed(3)} ETH`],
      ["Entry MC", money(quote.markCap)],
      ["Liquidation", money(quote.liquidationCap)],
      ["Price impact", `${quote.priceImpactPercent.toFixed(3)}%`],
    ];
  }, [amount, fee, mode, quote, selectedExecution, token.cap, totalSpotInvested, totalSpotTokens]);

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
        setNotice(v54SpotExecution ? "Confirm the real Robinhood Chain spot buy in your wallet…" : sessionExecution ? "Relaying the signed V45 spot-buy intent…" : contractExecution ? "Confirm the V43 spot buy in your wallet…" : "Executing spot buy…");
        const holding = await buySpot(token.slug, amount, selectedExecution.route === "Standard" ? "maker" : "market", { slippageBps: Math.round(selectedExecution.slippagePercent * 100), maxNetworkFeeEth: selectedExecution.maxNetworkFeeEth, maxPriceImpactPercent: 18 });
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
      setNotice(v54SpotExecution ? "Approve the ERC-20 if needed, then confirm the Robinhood Chain sell…" : sessionExecution ? "Relaying the signed V45 spot-sell intent…" : contractExecution ? "Approve if needed, then confirm the V43 sell…" : "Selling spot position…");
      for (const holding of marketHoldings) await sellHolding(holding.id, fraction, { slippageBps: Math.round(selectedExecution.slippagePercent * 100), maxNetworkFeeEth: selectedExecution.maxNetworkFeeEth, maxPriceImpactPercent: 18 });
      setNotice(`Sold ${(fraction * 100).toFixed(0)}% of the ${token.symbol} spot position.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Spot sell failed.");
    }
  };

  const cta = mode === "buy" ? `Buy ${token.symbol}` : mode === "sell" ? `Sell ${token.symbol}` : `Open ${activeLeverage}× ${mode}`;
  const disabled = executionBusy || insufficient || (v54SpotExecution && mode !== "buy" && mode !== "sell") || (mode !== "buy" && mode !== "sell" && orderMode === "market" && !quote.allowed) || (mode === "sell" && !marketHoldings.length);

  return <aside className="v37-trade-ticket">
    <div className="v37-ticket-presets">
      <span>{(["P1", "P2", "P3"] as FeePreset[]).map((preset) => <button type="button" key={preset} className={feePreset === preset ? "active" : ""} onClick={() => setFeePreset(preset)}>{preset}</button>)}</span>
      <button type="button" className="v37-fee-summary" onClick={() => setAdvanced((value) => !value)}><Settings2 size={14} />{selectedExecution.maxNetworkFeeEth.toFixed(5)} ETH · {selectedExecution.slippagePercent}%</button>
    </div>

    <div className="v37-side-tabs">
      {(["buy", "sell", "long", "short"] as TicketMode[]).map((item) => <button type="button" key={item} disabled={v54SpotExecution && (item === "long" || item === "short")} className={`${mode === item ? "active" : ""} ${item}`} onClick={() => { setMode(item); if (item === "sell") setOrderMode("market"); }}>{item}</button>)}
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

    {v54SpotExecution && <section className="v55-market-truth">
      <header><span><ShieldCheck size={15} /><b>Executable market truth</b></span><em className={marketState.toLowerCase()}>{marketState}</em></header>
      <div>
        <span><small>Chain</small><strong>{token.chainId ?? "—"}</strong></span>
        <span><small>Last block</small><strong>{token.chainLastBlock?.toLocaleString() ?? "Indexing"}</strong></span>
        <span><small>Chain sync</small><strong>{syncAgeSeconds === null ? "Pending" : `${syncAgeSeconds}s ago`}</strong></span>
        <span><small>Real ETH reserve</small><strong>{(token.realWethBalance ?? 0).toFixed(6)} ETH</strong></span>
        <span><small>Curve sold</small><strong>{(token.circulatingSpotTokens ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}</strong></span>
        <span><small>Curve remaining</small><strong>{(token.curveTokenReserve ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}</strong></span>
      </div>
      {marketState !== "ACTIVE" && <p>Quick execution is only trustworthy after a fresh canonical contract read. Stale or paused markets must not be treated as normally tradable.</p>}
    </section>}

    <section className={`v37-token-safety ${safetyOpen ? "open" : ""}`}>
      <button type="button" className="v37-safety-head" onClick={() => setSafetyOpen((value) => !value)}>
        <span>{safetyWarnings.length ? <AlertTriangle size={15} /> : <ShieldCheck size={15} />}<b>Token safety</b><small>{safetyWarnings.length ? `${safetyWarnings.length} warning${safetyWarnings.length === 1 ? "" : "s"}` : "Checks look healthy"}</small></span>
        <ChevronDown size={15} className={safetyOpen ? "open" : ""} />
      </button>
      {safetyOpen && <div className="v37-safety-grid">
        <span><small>Linked-wallet concentration</small><strong className={(safety.top10Share ?? 0) > 25 ? "warning" : ""}>{typeof safety.top10Share === "number" ? `${safety.top10Share.toFixed(1)}%` : "Not indexed"}</strong></span>
        <span><small>Unique traders</small><strong>{typeof safety.holders === "number" ? safety.holders.toLocaleString() : "Not indexed"}</strong></span>
        <span><small>Contract source</small><strong>{leverageXNative ? "Leverage X V55" : "Verify explorer"}</strong></span>
        <span><small>Fixed supply</small><strong className={leverageXNative ? "positive" : ""}>{leverageXNative ? "1,000,000,000" : "Verify"}</strong></span>
        <span><small>Additional mint</small><strong className={leverageXNative ? "positive" : ""}>{leverageXNative ? "Impossible" : "Unknown"}</strong></span>
        <span><small>Transfer tax</small><strong className={leverageXNative ? "positive" : ""}>{leverageXNative ? "None" : "Unknown"}</strong></span>
        <span><small>Blacklist / freeze</small><strong className={leverageXNative ? "positive" : ""}>{leverageXNative ? "None" : "Unknown"}</strong></span>
        <span><small>Creator free allocation</small><strong className={leverageXNative ? "positive" : ""}>{leverageXNative ? "None" : "Unknown"}</strong></span>
        <span><small>Creator perps</small><strong className={leverageXNative ? "positive" : ""}>{leverageXNative ? "Blocked" : "Unknown"}</strong></span>
      </div>}
    </section>

    <KeyButton className="v37-submit" tone={mode === "sell" || mode === "short" ? "red" : "green"} disabled={disabled} onClick={mode === "sell" ? () => void sellAcrossHoldings(1) : () => void submit()}><Zap size={17} />{executionBusy ? sessionExecution ? "Relaying intent…" : "Awaiting wallet…" : connected || contractExecution ? cta : "Connect wallet"}</KeyButton>
    <div className="v37-ticket-foot"><span>{feePreset} · {selectedExecution.route}</span><span>{selectedExecution.slippagePercent}% slippage</span><span>{selectedExecution.maxNetworkFeeEth.toFixed(5)} ETH max fee</span></div>
    {contractExecution && <div className={`v44-execution-strip ${chainExecution.phase}`}><span><b>{v54SpotExecution ? "LEVERAGE X ROBINHOOD SPOT" : sessionExecution ? orderMode === "market" ? "V45 SESSION" : "V46 KEEPER ORDER" : "V43 CONTRACT"}</b><small>{sessionExecution ? `Sponsored sequencer · seq ${token.chainStateSequence ?? "—"}` : walletAddress ? `${walletAddress.slice(0, 6)}…${walletAddress.slice(-4)} · seq ${token.chainStateSequence ?? "—"}` : "Wallet connects on first trade"}</small></span><em>{chainExecution.slug === token.slug ? chainExecution.phase.toUpperCase() : "READY"}</em></div>}
    {notice && <div className="v37-ticket-notice">{notice}</div>}
  </aside>;
}
