"use client";

import {
  ArrowDownRight,
  ArrowUpRight,
  Check,
  CircleDollarSign,
  Gauge,
  ImagePlus,
  Rocket,
  ShieldAlert,
  TrendingDown,
  TrendingUp,
  Wallet,
  X,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

const LEVERAGE_OPTIONS = [2, 5, 10, 20] as const;

type Direction = "long" | "short";

function money(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value);
}

export function HowItWorksModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [direction, setDirection] = useState<Direction>("long");
  const [leverage, setLeverage] = useState<(typeof LEVERAGE_OPTIONS)[number]>(20);
  const [margin, setMargin] = useState(100);
  const [priceMove, setPriceMove] = useState(-2);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    document.body.classList.add("lx-how-open");
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.classList.remove("lx-how-open");
    };
  }, [onClose, open]);

  const example = useMemo(() => {
    const notional = margin * leverage;
    const directionalMove = direction === "long" ? priceMove : -priceMove;
    const pnl = notional * directionalMove / 100;
    const roi = margin > 0 ? pnl / margin * 100 : 0;
    const remainingMargin = Math.max(0, margin + pnl);
    const approximateLiquidationDistance = 100 / leverage * 0.9;
    const adverseMove = direction === "long" ? Math.max(0, -priceMove) : Math.max(0, priceMove);
    const liquidationProgress = Math.min(100, adverseMove / approximateLiquidationDistance * 100);
    return { notional, pnl, roi, remainingMargin, approximateLiquidationDistance, liquidationProgress };
  }, [direction, leverage, margin, priceMove]);

  if (!open) return null;

  return (
    <div className="lx-how-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="lx-how-modal" role="dialog" aria-modal="true" aria-labelledby="lx-how-title">
        <header className="lx-how-header">
          <div>
            <span><Zap size={14} /> LEVERAGE X</span>
            <h2 id="lx-how-title">How it works</h2>
            <p>Launch a real memecoin, trade Spot, then use the same live market for longs and shorts when the BattlePool is activated.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close How It Works"><X size={19} /></button>
        </header>

        <div className="lx-how-scroll">
          <section className="lx-how-flow" aria-label="Leverage X lifecycle">
            <article><i><Wallet size={18} /></i><span><small>01</small><strong>Connect wallet</strong><p>Your wallet owns the launch and signs the on-chain transaction.</p></span></article>
            <article><i><ImagePlus size={18} /></i><span><small>02</small><strong>Create the coin</strong><p>Add the required image, name, and ticker. Description and social links are optional.</p></span></article>
            <article><i><Rocket size={18} /></i><span><small>03</small><strong>Choose initial buy</strong><p>Enter your total launch spend. Gas is reserved first; the remainder buys your token.</p></span></article>
            <article><i><CircleDollarSign size={18} /></i><span><small>04</small><strong>Live Spot price</strong><p>The first valid on-chain curve price creates the market used by the terminal.</p></span></article>
            <article><i><TrendingUp size={18} /></i><span><small>05</small><strong>Long or short</strong><p>Eligible traders choose direction, margin, and up to 20× leverage. The creator wallet cannot perp-trade its own token.</p></span></article>
          </section>

          <section className="lx-how-core">
            <div className="lx-how-explainer">
              <span className="lx-how-section-kicker">SPOT × PERPS</span>
              <h3>Leverage multiplies exposure—not safety.</h3>
              <p>A 20× position gives $20 of market exposure for every $1 of margin. A 1% move in the token is therefore about a 20% move against your margin before fees, funding, slippage, and price impact.</p>
              <div className="lx-how-truths">
                <span><Check size={13} /><b>You can close before liquidation.</b></span>
                <span><Check size={13} /><b>Closing a losing position still realizes the loss.</b></span>
                <span><ShieldAlert size={13} /><b>Higher leverage moves liquidation closer to entry.</b></span>
              </div>
              <div className="lx-how-warning"><ShieldAlert size={17} /><span><strong>20× can absolutely be liquidated.</strong> In a simplified model, a move near 5% against the position can consume the starting margin; actual liquidation is normally closer because maintenance margin and closing costs must remain.</span></div>
            </div>

            <div className="lx-how-calculator">
              <header><Gauge size={16} /><span><strong>Try a position</strong><small>Illustration only—not an execution quote</small></span></header>

              <div className="lx-how-direction">
                <button type="button" className={direction === "long" ? "active long" : ""} onClick={() => setDirection("long")}><ArrowUpRight size={14} />Long</button>
                <button type="button" className={direction === "short" ? "active short" : ""} onClick={() => setDirection("short")}><ArrowDownRight size={14} />Short</button>
              </div>

              <label className="lx-how-margin"><span>Margin</span><div><b>$</b><input type="number" min="1" max="100000" step="10" value={margin} onChange={(event) => setMargin(Math.max(1, Number(event.target.value) || 1))} /></div></label>

              <div className="lx-how-leverage"><span>Leverage</span><div>{LEVERAGE_OPTIONS.map((option) => <button type="button" key={option} className={leverage === option ? "active" : ""} onClick={() => setLeverage(option)}>{option}×</button>)}</div></div>

              <label className="lx-how-move">
                <span><b>Token price move</b><strong className={priceMove >= 0 ? "positive" : "negative"}>{priceMove > 0 ? "+" : ""}{priceMove.toFixed(1)}%</strong></span>
                <input type="range" min="-10" max="10" step="0.5" value={priceMove} onChange={(event) => setPriceMove(Number(event.target.value))} />
              </label>

              <div className="lx-how-metrics">
                <span><small>Position size</small><b>{money(example.notional)}</b></span>
                <span><small>Unrealized PNL</small><b className={example.pnl >= 0 ? "positive" : "negative"}>{example.pnl >= 0 ? "+" : ""}{money(example.pnl)}</b></span>
                <span><small>Return on margin</small><b className={example.roi >= 0 ? "positive" : "negative"}>{example.roi >= 0 ? "+" : ""}{example.roi.toFixed(1)}%</b></span>
                <span><small>Margin after close</small><b>{money(example.remainingMargin)}</b></span>
              </div>

              <div className="lx-how-liquidation">
                <span><small>Illustrative distance to liquidation zone</small><b>≈ {example.approximateLiquidationDistance.toFixed(1)}% adverse move</b></span>
                <div><i style={{ width: `${example.liquidationProgress}%` }} /></div>
                <p>{example.pnl < 0 ? `Closing now would realize approximately ${money(Math.abs(example.pnl))} in losses before fees and funding.` : "Closing now would realize the displayed gain before fees and funding."}</p>
              </div>
            </div>
          </section>

          <section className="lx-how-battlepool">
            <div><span><TrendingDown size={16} /></span><strong>Long liquidations</strong><p>Collateral and settlement flow back through the unified pool according to the protocol’s audited settlement rules.</p></div>
            <div><span><TrendingUp size={16} /></span><strong>Short liquidations</strong><p>Closing short exposure can create token-buy pressure because the position must be settled against the live market.</p></div>
            <div><span><ShieldAlert size={16} /></span><strong>Risk is always visible</strong><p>Entry, mark price, margin, PNL, liquidation price, TP, and SL belong directly on the trading workspace.</p></div>
          </section>
        </div>
      </section>
    </div>
  );
}
