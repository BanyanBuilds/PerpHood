"use client";

import Link from "next/link";
import { ArrowLeft, Binary, Blocks, FlaskConical, Gauge, ShieldCheck, Skull, Swords, Waves, Zap } from "lucide-react";
import { useMemo, useState } from "react";
import { Header } from "@/components/Header";
import { KeyButton } from "@/components/KeyButton";
import {
  createBattlePoolState,
  executeCloseShort,
  executeOpenLong,
  executeOpenShort,
  executeSequencedSpotBuy,
  executeSequencedSpotSell,
  executeSpotBuy,
  executeSpotSell,
  freeWeth,
  maybeReleaseSafetyInventory,
  shortInventoryUtilization,
  shortNotionalCapacity,
  totalTokenConservation,
  type BattlePoolConfig,
  type LongOpenTrade,
  type ShortOpenTrade,
} from "@/lib/battle-pool";
import type { Position } from "@/lib/types";

const TOTAL = 1_000_000_000;

function shortPosition(index: number, trade: ShortOpenTrade, leverage: number, collateral: number): Position {
  return {
    id: `lab-short-${index}`,
    slug: "lab",
    direction: "short",
    leverage,
    collateral,
    notional: collateral * leverage,
    entryCap: trade.priceAfter * TOTAL,
    currentCap: trade.priceAfter * TOTAL,
    liquidationCap: 0,
    openedAt: index,
    borrowedTokens: trade.borrowedTokens,
    lockedProceedsEth: trade.lockedProceedsEth,
    maintenanceMarginRate: 0.02,
  };
}

function longPosition(index: number, trade: LongOpenTrade, leverage: number, collateral: number): Position {
  return {
    id: `lab-long-${index}`,
    slug: "lab",
    direction: "long",
    leverage,
    collateral,
    notional: collateral * leverage,
    entryCap: trade.priceAfter * TOTAL,
    currentCap: trade.priceAfter * TOTAL,
    liquidationCap: 0,
    openedAt: index,
    tokenAmount: trade.tokens,
    debtEth: trade.debtEth,
    maintenanceMarginRate: 0.02,
  };
}

export default function RiskLabPage() {
  const [curvePercent, setCurvePercent] = useState(80);
  const [perpPercent, setPerpPercent] = useState(10);
  const [exponent, setExponent] = useState(5);
  const [devGenesisBuy, setDevGenesisBuy] = useState(1);
  const [battleSeedBuy, setBattleSeedBuy] = useState(1.5);
  const [battleTraders, setBattleTraders] = useState(40);
  const [battleCollateral, setBattleCollateral] = useState(0.001);
  const [battleLeverage, setBattleLeverage] = useState(20);
  const [squeezeBuy, setSqueezeBuy] = useState(0.5);
  const [cascadeSellPercent, setCascadeSellPercent] = useState(10);
  const safetyPercent = 100 - curvePercent - perpPercent;

  const result = useMemo(() => {
    try {
      const config: Partial<BattlePoolConfig> = {
        totalSupply: TOTAL,
        curveAllocation: TOTAL * curvePercent / 100,
        perpAllocation: TOTAL * perpPercent / 100,
        safetyAllocation: TOTAL * safetyPercent / 100,
        openingFdvEth: 0.25,
        curveExponent: exponent,
      };

      let devPool = createBattlePoolState(config);
      const devBuy = executeSpotBuy(devPool, devGenesisBuy);
      devPool = devBuy.next;
      const singleShortCapacity = shortNotionalCapacity(devPool);
      const attackCollateral = Math.min(0.05, Math.max(0.001, singleShortCapacity / 10 * 0.8));
      const devShort = executeOpenShort(devPool, attackCollateral, 10);
      devPool = devShort.next;
      const devExit = executeSpotSell(devPool, devBuy.tokens);
      devPool = devExit.next;
      const devShortClose = executeCloseShort(devPool, {
        collateral: attackCollateral,
        borrowedTokens: devShort.borrowedTokens,
        lockedProceedsEth: devShort.lockedProceedsEth,
      });

      const shortSeed = executeSpotBuy(createBattlePoolState(config), battleSeedBuy);
      let shortPool = shortSeed.next;
      const shorts: Position[] = [];
      let adaptiveReleaseObserved = false;
      let shortOpenReject: string | undefined;
      for (let index = 0; index < battleTraders; index += 1) {
        try {
          const trade = executeOpenShort(shortPool, battleCollateral, battleLeverage);
          const released = maybeReleaseSafetyInventory(trade.next);
          adaptiveReleaseObserved ||= released.adaptivePerpReleasedTokens > trade.next.adaptivePerpReleasedTokens;
          shortPool = released;
          shorts.push(shortPosition(index, trade, battleLeverage, battleCollateral));
        } catch (error) {
          shortOpenReject = error instanceof Error ? error.message : "Short capacity rejected the next position.";
          break;
        }
      }
      const shortUtilization = shortInventoryUtilization(shortPool);
      const shortSqueeze = executeSequencedSpotBuy(shortPool, squeezeBuy, shorts);

      const longSeed = executeSpotBuy(createBattlePoolState(config), battleSeedBuy);
      let longPool = longSeed.next;
      const longs: Position[] = [];
      let longOpenReject: string | undefined;
      for (let index = 0; index < battleTraders; index += 1) {
        try {
          const trade = executeOpenLong(longPool, battleCollateral, battleLeverage);
          longPool = trade.next;
          longs.push(longPosition(index, trade, battleLeverage, battleCollateral));
        } catch (error) {
          longOpenReject = error instanceof Error ? error.message : "Long capacity rejected the next position.";
          break;
        }
      }
      const longCascade = executeSequencedSpotSell(longPool, longSeed.tokens * cascadeSellPercent / 100, longs);

      const totalBadDebt = shortSqueeze.totalBadDebtEth + longCascade.totalBadDebtEth;
      return {
        ok: true as const,
        devShare: devBuy.tokens / TOTAL * 100,
        devExit: devExit.netEth,
        devPnl: devExit.netEth - devGenesisBuy,
        devShortPayout: devShortClose.payoutEth,
        shortsAdmitted: shorts.length,
        shortOpenReject,
        shortUtilization,
        adaptiveReleaseObserved,
        shortSteps: shortSqueeze.steps,
        shortLiquidations: shortSqueeze.liquidationEvents.length,
        shortMove: shortSqueeze.priceImpactPercent,
        shortRetained: shortSqueeze.totalResidualEquityEth,
        shortFreeWeth: freeWeth(shortSqueeze.next),
        longsAdmitted: longs.length,
        longOpenReject,
        longSteps: longCascade.steps,
        longLiquidations: longCascade.liquidationEvents.length,
        longMove: longCascade.priceImpactPercent,
        longRetained: longCascade.totalResidualEquityEth,
        longFreeWeth: freeWeth(longCascade.next),
        totalBadDebt,
        conserved: totalTokenConservation(longCascade.next),
        finalAdaptiveTokens: shortSqueeze.next.adaptivePerpReleasedTokens,
      };
    } catch (error) {
      return { ok: false as const, error: error instanceof Error ? error.message : "Scenario rejected." };
    }
  }, [battleCollateral, battleLeverage, battleSeedBuy, battleTraders, cascadeSellPercent, curvePercent, devGenesisBuy, exponent, perpPercent, safetyPercent, squeezeBuy]);

  const protectedCurvePercent = curvePercent * 6 / 100;
  const closeabilityCoverage = protectedCurvePercent + safetyPercent;

  return <><Header /><main className="admin-revenue-page page-shell">
    <section className="admin-revenue-hero glass-panel">
      <div><span className="eyebrow">PRIVATE ENGINE WORKSPACE</span><h1>V20 Battle sequencer lab</h1><p>Stress one shared pool with genesis whales, forty crowded 20× positions, real forced liquidations, adaptive token inventory, and exact-boundary atomic execution.</p></div>
      <Link href="/admin/revenue"><KeyButton compact><Waves size={15} />Economics</KeyButton></Link>
      <Link href="/admin/local-chain"><KeyButton compact><Blocks size={15} />Local chain</KeyButton></Link>
      <Link href="/terminal"><KeyButton compact tone="dark"><ArrowLeft size={15} />Terminal</KeyButton></Link>
    </section>

    <section className="revenue-controls glass-panel">
      <Control label="Public curve allocation" note="Spot buyers and leveraged longs" value={curvePercent} min={60} max={90} step={1} suffix="%" onChange={setCurvePercent} />
      <Control label="Initial short inventory" note="Can expand adaptively from safety" value={perpPercent} min={5} max={25} step={1} suffix="%" onChange={setPerpPercent} />
      <Control label="Adaptive safety inventory" note="Unallocated supply; never fixed forever" value={safetyPercent} suffix="%" readOnly />
      <Control label="BattleCurve exponent" note="Punishes oversized genesis buys" value={exponent} min={2} max={10} step={0.5} onChange={setExponent} />
      <Control label="Developer genesis buy" note="Anti-dev full-exit sequence" value={devGenesisBuy} min={0.001} max={10} step={0.05} suffix=" ETH" onChange={setDevGenesisBuy} />
      <Control label="Crowded battle seed" note="Real WETH depth before 40-way test" value={battleSeedBuy} min={0.1} max={10} step={0.1} suffix=" ETH" onChange={setBattleSeedBuy} />
      <Control label="Battle traders" note="Same-side positions opened sequentially" value={battleTraders} min={1} max={100} step={1} onChange={setBattleTraders} />
      <Control label="Margin per trader" note="Real collateral posted by each trader" value={battleCollateral} min={0.001} max={0.1} step={0.001} suffix=" ETH" onChange={setBattleCollateral} />
      <label><span><strong>Battle leverage</strong><small>Shared for the crowd test</small></span><select value={battleLeverage} onChange={(event) => setBattleLeverage(Number(event.target.value))}><option value={2}>2×</option><option value={5}>5×</option><option value={10}>10×</option><option value={20}>20×</option></select><b>{battleLeverage}×</b></label>
      <Control label="Short-squeeze buy" note="Atomic order routed through liquidation boundaries" value={squeezeBuy} min={0.001} max={10} step={0.05} suffix=" ETH" onChange={setSqueezeBuy} />
      <Control label="Long-cascade spot sell" note="Percent of the seed holder's tokens sold" value={cascadeSellPercent} min={1} max={100} step={1} suffix="%" onChange={setCascadeSellPercent} />
    </section>

    <section className="revenue-kpi-grid">
      <Kpi icon={Swords} label="Genesis ownership" value={result.ok ? `${result.devShare.toFixed(2)}%` : "Rejected"} note="Developer's real share after the genesis purchase" />
      <Kpi icon={Skull} label="Developer full exit" value={result.ok ? `${result.devExit.toFixed(6)} ETH` : "—"} note={result.ok ? `${result.devPnl.toFixed(6)} ETH realized after a short attack` : result.error} tone={result.ok && result.devPnl < 0 ? "negative" : undefined} />
      <Kpi icon={Zap} label="Short squeeze" value={result.ok ? `${result.shortLiquidations}/${result.shortsAdmitted}` : "—"} note={result.ok ? `${result.shortMove.toFixed(2)}% upward move · ${result.shortSteps} internal steps` : "Scenario must pass"} tone={result.ok && result.shortLiquidations > 0 ? "positive" : undefined} />
      <Kpi icon={Waves} label="Long cascade" value={result.ok ? `${result.longLiquidations}/${result.longsAdmitted}` : "—"} note={result.ok ? `${result.longMove.toFixed(2)}% downward move · ${result.longSteps} internal steps` : "Scenario must pass"} tone={result.ok && result.longLiquidations > 0 ? "negative" : undefined} />
    </section>

    <section className="revenue-detail-grid">
      <article className="revenue-ledger glass-panel"><header><span><ShieldCheck size={18} /><strong>Token closeability</strong></span><b>{closeabilityCoverage >= perpPercent ? "PASS" : "FAIL"}</b></header><Metric label="Protected curve floor" value={`${protectedCurvePercent.toFixed(2)}%`} /><Metric label="Adaptive safety" value={`${safetyPercent.toFixed(2)}%`} /><Metric label="Combined repayment inventory" value={`${closeabilityCoverage.toFixed(2)}%`} /><Metric label="Initial short inventory" value={`${perpPercent.toFixed(2)}%`} /><footer><span>Dynamic release observed</span><strong>{result.ok && result.adaptiveReleaseObserved ? "YES" : "NO"}</strong></footer></article>
      <article className="revenue-ledger glass-panel"><header><span><Zap size={18} /><strong>Forty-short squeeze</strong></span><b>{result.ok && result.totalBadDebt === 0 ? "SOLVENT" : "CHECK"}</b></header><Metric label="20× shorts admitted" value={result.ok ? `${result.shortsAdmitted}/${battleTraders}` : "—"} /><Metric label="Inventory utilization" value={result.ok ? `${(result.shortUtilization * 100).toFixed(2)}%` : "—"} /><Metric label="Equity retained by pool" value={result.ok ? `${result.shortRetained.toFixed(6)} ETH` : "—"} /><Metric label="Ending free WETH" value={result.ok ? `${result.shortFreeWeth.toFixed(6)} ETH` : "—"} /><footer><span>{result.ok && result.shortOpenReject ? result.shortOpenReject : "Atomic squeeze execution"}</span><strong>{result.ok ? `${result.shortSteps} steps` : "Rejected"}</strong></footer></article>
      <article className="revenue-ledger glass-panel"><header><span><Binary size={18} /><strong>Forty-long cascade</strong></span><b>{result.ok && result.totalBadDebt === 0 ? "SOLVENT" : "CHECK"}</b></header><Metric label="20× longs admitted" value={result.ok ? `${result.longsAdmitted}/${battleTraders}` : "—"} /><Metric label="Liquidations" value={result.ok ? result.longLiquidations.toString() : "—"} /><Metric label="Equity retained by pool" value={result.ok ? `${result.longRetained.toFixed(6)} ETH` : "—"} /><Metric label="Ending free WETH" value={result.ok ? `${result.longFreeWeth.toFixed(6)} ETH` : "—"} /><footer><span>{result.ok && result.longOpenReject ? result.longOpenReject : "Atomic sell-cascade execution"}</span><strong>{result.ok ? `${result.longSteps} steps` : "Rejected"}</strong></footer></article>
      <article className="revenue-ledger glass-panel"><header><span><Gauge size={18} /><strong>V20 invariant ledger</strong></span><b>{result.ok && result.totalBadDebt < 1e-10 ? "PASS" : "REJECT"}</b></header><Metric label="Combined bad debt" value={result.ok ? `${result.totalBadDebt.toFixed(12)} ETH` : "—"} /><Metric label="Final token conservation" value={result.ok ? Math.round(result.conserved).toLocaleString() : "—"} /><Metric label="Expected supply" value={TOTAL.toLocaleString()} /><Metric label="Dynamic inventory remaining" value={result.ok ? Math.round(result.finalAdaptiveTokens).toLocaleString() : "—"} /><footer><span>Default allocation</span><strong>80 / 10 / 10 adaptive</strong></footer></article>
    </section>

    <section className="revenue-policy-note glass-panel"><FlaskConical size={20} /><span><strong>One user action, many internal boundaries</strong><small>The trader experiences one instant atomic fill. The execution engine internally jumps to exact liquidation or impact boundaries, liquidates unsafe positions between segments, and rejects any route that would create bad debt.</small></span><ShieldCheck size={20} /></section>
  </main></>;
}

function Control({ label, note, value, min, max, step, suffix, readOnly, onChange }: { label: string; note: string; value: number; min?: number; max?: number; step?: number; suffix?: string; readOnly?: boolean; onChange?: (value: number) => void }) {
  return <label><span><strong>{label}</strong><small>{note}</small></span><input type="number" min={min} max={max} step={step} value={Number.isFinite(value) ? value : 0} readOnly={readOnly} onChange={(event) => onChange?.(Number(event.target.value) || 0)} /><b>{value}{suffix ?? ""}</b></label>;
}

function Kpi({ icon: Icon, label, value, note, tone }: { icon: typeof Swords; label: string; value: string; note: string; tone?: "positive" | "negative" }) {
  return <article className="revenue-kpi glass-panel"><Icon size={19} /><small>{label}</small><strong className={tone}>{value}</strong><span>{note}</span></article>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div><span><strong>{label}</strong></span><b>{value}</b></div>;
}
