"use client";

import Link from "next/link";
import { Activity, ArrowLeft, Binary, CandlestickChart, Gauge, ShieldCheck, Zap } from "lucide-react";
import { useMemo } from "react";
import { Header } from "@/components/Header";
import { KeyButton } from "@/components/KeyButton";
import { FP_WAD } from "@/lib/fixed-point-battle-curve";
import { V24EventIndexer, type V24CommittedEvent, type V24PositionSnapshot } from "@/lib/chain/v24-event-stream";
import { applyV24OpenLong, applyV24SpotBuy, createV24VerifiedPoolState, v24LogicalTokenConservation } from "@/lib/chain/v24-verified-action";
import { useV24BattleChain } from "@/hooks/useV24BattleChain";

const hash = (seed: number) => `0x${seed.toString(16).padStart(64, "0")}` as `0x${string}`;

function formatWad(value: bigint, decimals = 6) {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const whole = absolute / FP_WAD;
  if (decimals <= 0) return `${negative ? "-" : ""}${whole}`;
  const fraction = (absolute % FP_WAD).toString().padStart(18, "0").slice(0, decimals);
  return `${negative ? "-" : ""}${whole}.${fraction}`;
}

function buildVerificationDemo() {
  let pool = createV24VerifiedPoolState({ poolWethWad: 5n * FP_WAD });
  const genesis = applyV24SpotBuy(pool, FP_WAD);
  pool = genesis.next;
  const long = applyV24OpenLong(pool, FP_WAD / 5n, FP_WAD / 40n);
  pool = long.next;
  const positions: V24PositionSnapshot[] = [{
    id: "v24-long",
    owner: "0x00000000000000000000000000000000000a11ce",
    direction: "long",
    collateralWad: FP_WAD / 40n,
    tokenAmountWad: long.proof.curveTokenAmountWad,
    debtWad: 7n * FP_WAD / 40n,
    lockedShortProceedsWad: 0n,
  }];
  const indexer = new V24EventIndexer();
  let latestPnl = 0n;
  let maxProcessingMicros = 0;
  for (let index = 0; index < 120; index++) {
    const fill = applyV24SpotBuy(pool, FP_WAD / 20_000n);
    pool = fill.next;
    const event: V24CommittedEvent = {
      sequence: BigInt(index),
      timestampMs: 1_800_000_000_000 + index * 250,
      blockNumber: BigInt(index + 1),
      transactionHash: hash(index + 1),
      action: 1,
      marginalPriceWad: fill.proof.marginalPriceAfterWad,
      marketCapWad: fill.proof.marketCapAfterWad,
      poolWethWad: pool.poolWethWad,
      reservedWethWad: pool.reservedWethWad,
      curveSoldTokenWad: pool.curveSoldTokenWad,
      positionsRoot: hash(index + 200),
      balancesRoot: hash(index + 400),
      stateHash: hash(index + 600),
    };
    const snapshot = indexer.ingest(event, positions);
    latestPnl = snapshot.aggregatePnlWad;
    maxProcessingMicros = Math.max(maxProcessingMicros, snapshot.processingMicros);
  }
  return {
    sequence: indexer.lastSequence,
    priceWad: indexer.history(1).at(-1)?.closeWad ?? 0n,
    pnlWad: latestPnl,
    maxProcessingMicros,
    candles1s: indexer.history(1).length,
    candles15s: indexer.history(15).length,
    candles30s: indexer.history(30).length,
    tokenConservation: v24LogicalTokenConservation(pool),
    curveSoldWad: pool.curveSoldTokenWad,
  };
}

export default function V24VerificationPage() {
  const demo = useMemo(buildVerificationDemo, []);
  const chain = useV24BattleChain();
  return <><Header/><main className="session-key-page page-shell">
    <section className="session-key-hero glass-panel">
      <div><span className="eyebrow">V24 CONTRACT-GRADE BATTLECURVE</span><h1>One integer state drives execution, candles, and live PNL.</h1><p>The sequencer may acknowledge trades optimistically, but the contract independently recomputes the exponent-5 curve, protected inventory, fee rounding, market price, and token movement before accepting settlement.</p></div>
      <div className="session-key-hero-actions"><Link href="/admin/execution"><KeyButton compact tone="dark"><ArrowLeft size={15}/>V23 execution</KeyButton></Link><Link href="/terminal"><KeyButton compact><Gauge size={15}/>Terminal</KeyButton></Link></div>
    </section>

    <section className={`session-key-status glass-panel ${chain.connected ? "positive" : "warning"}`}>
      <span><i/><strong>{chain.connected ? "V24 contract connected" : "V24 deterministic demo"}</strong><small>{chain.error ?? (chain.enabled ? "Polling fixed-point contract" : "Deploy V24 to enable chain authority")}</small></span>
      <span><Zap size={17}/><small>Chain frame</small><strong>{chain.state ? `#${chain.state.sequence}` : `#${demo.sequence.toString()}`}</strong></span>
      <span><Gauge size={17}/><small>RPC latency</small><strong>{chain.state ? `${chain.state.rpcLatencyMs.toFixed(2)} ms` : "Local only"}</strong></span>
      <span><ShieldCheck size={17}/><small>Liquidation batch</small><strong>{chain.continuation?.active ? `${chain.continuation.nextCursor}/${chain.continuation.totalPositions}` : "Clear"}</strong></span>
    </section>

    <section className="v24-proof-grid">
      <article className="session-key-card glass-panel"><header><span><Binary size={18}/><strong>Fixed-point authority</strong></span><b>NO FLOATS</b></header><p>Token quantities, prices, curve cost, fees, and payouts use deterministic WAD integers with explicit down-rounding.</p><div className="session-key-mini-ledger"><span><small>Opening price</small><strong>250,000,000 wei</strong></span><span><small>Curve exponent</small><strong>5</strong></span><span><small>Protected inventory</small><strong>6%</strong></span><span><small>Trade fee</small><strong>0.30%</strong></span></div></article>
      <article className="session-key-card glass-panel"><header><span><ShieldCheck size={18}/><strong>Contract checks</strong></span><b>ALL 4 SIDES</b></header><p>Spot buy, spot sell, leveraged long, and leveraged short must produce the exact contract quote and next inventory buckets.</p><div className="v24-action-row"><span>BUY</span><span>LONG</span><span>SELL</span><span>SHORT</span></div></article>
      <article className="session-key-card glass-panel"><header><span><Zap size={18}/><strong>Liquidation continuation</strong></span><b>16 / CHUNK</b></header><p>Large cascades pause new user actions and resume from an exact cursor across bounded keeper transactions—without reordering the battle.</p><div className="session-key-mini-ledger"><span><small>Cursor model</small><strong>Monotonic</strong></span><span><small>Restart root</small><strong>Committed</strong></span></div></article>
    </section>

    <section className="sponsored-trade-card glass-panel">
      <div className="sponsored-trade-copy"><span className="eyebrow">ORDERED EVENT DEMO</span><h2>120 frames processed</h2><p>The same state sequence generated candles and executable close PNL. No chart-only price feed exists.</p></div>
      <div className="sponsored-trade-metrics"><span><Activity size={16}/><small>Latest frame</small><strong>#{demo.sequence.toString()}</strong></span><span><Gauge size={16}/><small>Max index time</small><strong>{demo.maxProcessingMicros.toFixed(2)} µs</strong></span><span><CandlestickChart size={16}/><small>1s / 15s / 30s</small><strong>{demo.candles1s} / {demo.candles15s} / {demo.candles30s}</strong></span><span><Zap size={16}/><small>Executable PNL</small><strong className={demo.pnlWad >= 0n ? "positive" : "negative"}>{formatWad(demo.pnlWad)} ETH</strong></span></div>
    </section>

    <section className="local-chain-warning glass-panel"><ShieldCheck size={21}/><span><strong>Exactly one billion tokens conserved</strong><small>{formatWad(demo.tokenConservation, 0)} logical tokens reconcile across curve inventory, spot ownership, long locks, and adaptive short/safety inventory. V24 still requires Foundry execution, Robinhood Chain test deployment, and independent audit before real funds.</small></span></section>
  </main></>;
}
