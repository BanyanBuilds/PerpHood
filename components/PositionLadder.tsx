import { Crosshair, Flag, ShieldAlert, Target } from "lucide-react";
import { money } from "@/lib/format";
import type { PositionDirection } from "@/lib/types";

type PositionLadderProps = {
  direction: PositionDirection;
  entry: number;
  current: number;
  liquidation: number;
  takeProfit?: number;
  stopLoss?: number;
};

type LadderLevel = {
  key: string;
  label: string;
  value: number;
  tone: "target" | "current" | "entry" | "stop" | "liquidation";
};

export function PositionLadder({ direction, entry, current, liquidation, takeProfit, stopLoss }: PositionLadderProps) {
  const fallbackTarget = direction === "long" ? entry * 1.18 : entry * 0.82;
  const fallbackStop = direction === "long" ? entry * 0.94 : entry * 1.06;
  const levels: LadderLevel[] = [
    { key: "target", label: "Take profit", value: takeProfit ?? fallbackTarget, tone: "target" },
    { key: "current", label: "Current", value: current, tone: "current" },
    { key: "entry", label: "Entry", value: entry, tone: "entry" },
    { key: "stop", label: "Stop loss", value: stopLoss ?? fallbackStop, tone: "stop" },
    { key: "liquidation", label: "Liquidation", value: liquidation, tone: "liquidation" },
  ];

  const values = levels.map((level) => level.value);
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const padding = Math.max((rawMax - rawMin) * 0.14, rawMax * 0.012, 1);
  const min = rawMin - padding;
  const max = rawMax + padding;
  const range = Math.max(max - min, 1);
  const topFor = (value: number) => `${((max - value) / range) * 100}%`;
  const upside = direction === "long" ? ((levels[0].value - current) / current) * 100 : ((current - levels[0].value) / current) * 100;
  const downside = direction === "long" ? ((current - levels[3].value) / current) * 100 : ((levels[3].value - current) / current) * 100;
  const liqDistance = Math.abs(current - liquidation) / Math.max(current, 1) * 100;

  return <section className={`position-ladder ${direction}`} aria-label={`${direction} position price ladder`}>
    <header>
      <span><Crosshair size={14} />Position ladder</span>
      <b className={liqDistance < 4 ? "negative" : ""}>{liqDistance.toFixed(1)}% to liquidation</b>
    </header>
    <div className="position-ladder-stage">
      <div className="ladder-rail" aria-hidden="true"><i /></div>
      {levels.map((level) => <div key={level.key} className={`ladder-level ${level.tone}`} style={{ top: topFor(level.value) }}>
        <span className="ladder-level-icon">{level.tone === "target" ? <Target size={12} /> : level.tone === "liquidation" ? <ShieldAlert size={12} /> : level.tone === "entry" ? <Flag size={11} /> : null}</span>
        <span className="ladder-level-copy"><small>{level.label}</small><strong>{money(level.value)}</strong></span>
        <i aria-hidden="true" />
      </div>)}
    </div>
    <footer>
      <span><small>Target distance</small><strong className="positive">+{Math.max(upside, 0).toFixed(1)}%</strong></span>
      <span><small>Stop distance</small><strong className="negative">-{Math.max(downside, 0).toFixed(1)}%</strong></span>
      <em>TP and SL levels appear after they are configured.</em>
    </footer>
  </section>;
}
