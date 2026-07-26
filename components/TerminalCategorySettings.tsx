"use client";

import { Gauge, Settings2, ShieldCheck, SlidersHorizontal, Zap } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import {
  applyFeePreset,
  normalizeCategorySettings,
  type CategoryTradingSettings,
  type DefaultLeverage,
  type FeePreset,
  type TerminalCategoryKey,
} from "@/lib/terminal-settings";
import { useOutsideDismiss } from "./useOutsideDismiss";

type Props = {
  category: TerminalCategoryKey;
  label: string;
  value: CategoryTradingSettings;
  onChange: (next: CategoryTradingSettings) => void;
};

const FEE_PRESETS: FeePreset[] = ["economy", "fast", "turbo", "custom"];
const LEVERAGE: DefaultLeverage[] = [2, 5, 10, 20];

function NumericField({ label, value, onChange, suffix, step = 0.01, min = 0, max }: { label: string; value: number; onChange: (value: number) => void; suffix?: string; step?: number; min?: number; max?: number }) {
  return <label className="category-setting-field"><span>{label}</span><div><input type="number" inputMode="decimal" value={value} min={min} max={max} step={step} onChange={(event) => onChange(Number(event.target.value))} />{suffix && <small>{suffix}</small>}</div></label>;
}

export function TerminalCategorySettings({ category, label, value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"trade" | "filters" | "display">("trade");
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useOutsideDismiss([buttonRef, popoverRef], close, open);

  const patch = (next: Partial<CategoryTradingSettings>) => onChange(normalizeCategorySettings({ ...value, ...next }));
  const chooseFeePreset = (preset: FeePreset) => onChange(normalizeCategorySettings(applyFeePreset(value, preset)));

  return <>
    <button ref={buttonRef} className={open ? "active category-settings-trigger" : "category-settings-trigger"} onClick={() => setOpen((current) => !current)} title={`${label} presets and filters`} aria-label={`Open ${label} settings`}><Settings2 size={14} /></button>
    {open && <div ref={popoverRef} className="category-settings-popover" data-category={category}>
      <header><span><strong>{label}</strong><small>Independent saved execution profile</small></span><em>{value.quickLongEnabled ? `L ${value.quickLongLeverage}×` : "L OFF"} · {value.quickShortEnabled ? `S ${value.quickShortLeverage}×` : "S OFF"}</em></header>
      <nav>
        <button className={tab === "trade" ? "active" : ""} onClick={() => setTab("trade")}><Zap size={13} />Trade</button>
        <button className={tab === "filters" ? "active" : ""} onClick={() => setTab("filters")}><SlidersHorizontal size={13} />Filters</button>
        <button className={tab === "display" ? "active" : ""} onClick={() => setTab("display")}><Gauge size={13} />Guards</button>
      </nav>

      {tab === "trade" && <div className="category-settings-body">
        <NumericField label="Quick spot buy" value={value.quickBuyEth} onChange={(quickBuyEth) => patch({ quickBuyEth })} suffix="ETH" step={0.001} min={0.0001} max={100} />

        <QuickPerpPresetEditor
          side="long"
          enabled={value.quickLongEnabled}
          collateral={value.quickLongCollateralEth}
          leverage={value.quickLongLeverage}
          onEnabled={(quickLongEnabled) => patch({ quickLongEnabled })}
          onCollateral={(quickLongCollateralEth) => patch({ quickLongCollateralEth })}
          onLeverage={(quickLongLeverage) => patch({ quickLongLeverage })}
        />
        <QuickPerpPresetEditor
          side="short"
          enabled={value.quickShortEnabled}
          collateral={value.quickShortCollateralEth}
          leverage={value.quickShortLeverage}
          onEnabled={(quickShortEnabled) => patch({ quickShortEnabled })}
          onCollateral={(quickShortCollateralEth) => patch({ quickShortCollateralEth })}
          onLeverage={(quickShortLeverage) => patch({ quickShortLeverage })}
        />

        <div className="category-setting-block"><span>Fee preset</span><div className="segmented-setting">{FEE_PRESETS.map((preset) => <button key={preset} className={value.feePreset === preset ? "active" : ""} onClick={() => chooseFeePreset(preset)}>{preset}</button>)}</div></div>
        <div className="category-setting-pair">
          <NumericField label="Buy priority" value={value.buyPriorityFeeEth} onChange={(buyPriorityFeeEth) => patch({ buyPriorityFeeEth, feePreset: "custom" })} suffix="ETH" step={0.00001} />
          <NumericField label="Sell priority" value={value.sellPriorityFeeEth} onChange={(sellPriorityFeeEth) => patch({ sellPriorityFeeEth, feePreset: "custom" })} suffix="ETH" step={0.00001} />
        </div>
        <div className="category-setting-pair">
          <NumericField label="Buy slippage" value={value.buySlippagePercent} onChange={(buySlippagePercent) => patch({ buySlippagePercent, slippageMode: "custom", autoSlippage: false })} suffix="%" step={0.5} min={0.1} max={100} />
          <NumericField label="Sell slippage" value={value.sellSlippagePercent} onChange={(sellSlippagePercent) => patch({ sellSlippagePercent, slippageMode: "custom", autoSlippage: false })} suffix="%" step={0.5} min={0.1} max={100} />
        </div>
        <p className="category-settings-note"><ShieldCheck size={14} />Quick Long and Quick Short are disabled until their individual preset switch is enabled. A disabled row button never opens a panel and never sends a transaction.</p>
      </div>}

      {tab === "filters" && <div className="category-settings-body">
        <div className="category-setting-pair">
          <NumericField label="Minimum market cap" value={value.minMarketCap} onChange={(minMarketCap) => patch({ minMarketCap })} suffix="$" step={1000} />
          <NumericField label="Minimum liquidity" value={value.minLiquidityEth} onChange={(minLiquidityEth) => patch({ minLiquidityEth })} suffix="ETH" step={0.1} />
        </div>
        <div className="category-setting-pair">
          <NumericField label="Minimum holders" value={value.minHolders} onChange={(minHolders) => patch({ minHolders })} step={1} />
          <NumericField label="Maximum age" value={value.maxAgeMinutes} onChange={(maxAgeMinutes) => patch({ maxAgeMinutes })} suffix="min · 0 off" step={5} />
        </div>
        <ToggleRow label="Positive momentum only" value={value.positiveOnly} onChange={(positiveOnly) => patch({ positiveOnly })} />
        <ToggleRow label="OG coins only" value={value.ogOnly} onChange={(ogOnly) => patch({ ogOnly })} />
        <ToggleRow label="Hide high wallet concentration" value={value.hideHighConcentration} onChange={(hideHighConcentration) => patch({ hideHighConcentration })} />
      </div>}

      {tab === "display" && <div className="category-settings-body">
        <ToggleRow label="Automatic slippage" value={value.autoSlippage} onChange={(autoSlippage) => patch({ autoSlippage, slippageMode: autoSlippage ? "auto" : "custom" })} />
        <ToggleRow label="MEV / sandwich protection" value={value.mevProtection} onChange={(mevProtection) => patch({ mevProtection })} icon />
        <NumericField label="Maximum price impact" value={value.maxPriceImpactPercent} onChange={(maxPriceImpactPercent) => patch({ maxPriceImpactPercent })} suffix="%" step={0.5} min={0.1} max={100} />
        <p className="category-settings-note"><ShieldCheck size={14} />These values are saved only for <b>{label}</b>. Other columns keep their own execution and discovery profile.</p>
      </div>}
    </div>}
  </>;
}

function QuickPerpPresetEditor({
  side,
  enabled,
  collateral,
  leverage,
  onEnabled,
  onCollateral,
  onLeverage,
}: {
  side: "long" | "short";
  enabled: boolean;
  collateral: number;
  leverage: DefaultLeverage;
  onEnabled: (enabled: boolean) => void;
  onCollateral: (collateral: number) => void;
  onLeverage: (leverage: DefaultLeverage) => void;
}) {
  const title = side === "long" ? "Quick Long" : "Quick Short";
  return <section className={`quick-perp-preset-editor ${side} ${enabled ? "enabled" : "disabled"}`}>
    <header>
      <span><strong>{title}</strong><small>{enabled ? `${collateral.toLocaleString(undefined, { maximumFractionDigits: 6 })} ETH collateral · ${leverage}×` : "Not configured — row action disabled"}</small></span>
      <button className="quick-preset-toggle" onClick={() => onEnabled(!enabled)} aria-pressed={enabled}><i className={enabled ? "on" : ""}><b /></i>{enabled ? "Enabled" : "Disabled"}</button>
    </header>
    <div className="category-setting-pair">
      <NumericField label={`${title} collateral`} value={collateral} onChange={onCollateral} suffix="ETH" step={0.001} min={0.0001} max={100} />
      <div className="category-setting-block"><span>{title} leverage</span><div className="segmented-setting leverage">{LEVERAGE.map((option) => <button key={option} className={leverage === option ? "active" : ""} onClick={() => onLeverage(option)}>{option}×</button>)}</div></div>
    </div>
  </section>;
}

function ToggleRow({ label, value, onChange, icon = false }: { label: string; value: boolean; onChange: (value: boolean) => void; icon?: boolean }) {
  return <button className="category-toggle-row" onClick={() => onChange(!value)}><span>{icon && <ShieldCheck size={14} />}{label}</span><i className={value ? "on" : ""}><b /></i></button>;
}
