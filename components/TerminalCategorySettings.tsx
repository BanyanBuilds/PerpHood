"use client";

import { Gauge, RadioTower, Settings2, ShieldCheck, SlidersHorizontal, TimerReset, Zap } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import {
  applyFeePreset,
  getActionSlippagePercent,
  getExecutionPreset,
  normalizeCategorySettings,
  updateExecutionPreset,
  type CategoryTradingSettings,
  type DefaultLeverage,
  type ExecutionRoute,
  type MevMode,
  type QuickPresetKey,
  type TerminalCategoryKey,
  type TradeActionProfile,
} from "@/lib/terminal-settings";
import { useOutsideDismiss } from "./useOutsideDismiss";

type Props = {
  category: TerminalCategoryKey;
  label: string;
  value: CategoryTradingSettings;
  onChange: (next: CategoryTradingSettings) => void;
};

const PRESETS: Array<{ key: QuickPresetKey; name: string }> = [
  { key: "P1", name: "Standard" },
  { key: "P2", name: "Fast" },
  { key: "P3", name: "Assault" },
];
const LEVERAGE: DefaultLeverage[] = [2, 5, 10, 20];
const ACTIONS: TradeActionProfile[] = ["buy", "sell", "long", "short", "close"];
const ROUTES: ExecutionRoute[] = ["standard", "fast", "assault", "protected"];
const MEV_MODES: MevMode[] = ["auto", "protected", "public", "redundant"];

function NumericField({ label, value, onChange, suffix, step = 0.01, min = 0, max }: { label: string; value: number; onChange: (value: number) => void; suffix?: string; step?: number; min?: number; max?: number }) {
  return <label className="category-setting-field"><span>{label}</span><div><input type="number" inputMode="decimal" value={value} min={min} max={max} step={step} onChange={(event) => onChange(Number(event.target.value))} />{suffix && <small>{suffix}</small>}</div></label>;
}

export function TerminalCategorySettings({ category, label, value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"trade" | "filters" | "guards">("trade");
  const [action, setAction] = useState<TradeActionProfile>("buy");
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useOutsideDismiss([buttonRef, popoverRef], close, open);

  const normalized = normalizeCategorySettings(value);
  const activePreset = normalized.activePreset;
  const execution = getExecutionPreset(normalized, activePreset);
  const patch = (next: Partial<CategoryTradingSettings>) => onChange(normalizeCategorySettings({ ...normalized, ...next }));
  const patchExecution = (next: Parameters<typeof updateExecutionPreset>[2]) => onChange(updateExecutionPreset(normalized, activePreset, next));
  const selectPreset = (preset: QuickPresetKey) => onChange(applyFeePreset(normalized, preset));
  const setActionSlippage = (slippage: number) => {
    if (action === "buy") return patchExecution({ buySlippagePercent: slippage });
    if (action === "sell") return patchExecution({ sellSlippagePercent: slippage });
    if (action === "long") return patchExecution({ longSlippagePercent: slippage });
    if (action === "short") return patchExecution({ shortSlippagePercent: slippage });
    return patchExecution({ closeSlippagePercent: slippage });
  };

  return <>
    <button ref={buttonRef} className={open ? "active category-settings-trigger" : "category-settings-trigger"} onClick={() => setOpen((current) => !current)} title={`${label} execution presets and filters`} aria-label={`Open ${label} settings`}><Settings2 size={14} /></button>
    {open && <div ref={popoverRef} className="category-settings-popover v55-execution-settings" data-category={category}>
      <header>
        <span><strong>{label} Quick Trade</strong><small>Independent Buy · Sell · Long · Short · Close profile</small></span>
        <em>{activePreset} · {execution.executionRoute}</em>
      </header>

      <div className="v82-preset-row">
        <span><small>Trading preset</small><strong>{PRESETS.find((item) => item.key === activePreset)?.name ?? "Standard"}</strong></span>
        <div className="v55-preset-switcher" aria-label="Execution preset">
          {PRESETS.map(({ key, name }) => {
            const profile = getExecutionPreset(normalized, key);
            return <button key={key} className={activePreset === key ? "active" : ""} onClick={() => selectPreset(key)} title={`${name}: ${profile.executionRoute}, max ${profile.maxNetworkFeeEth.toFixed(5)} ETH network fee`}>
              <b>{name}</b>
            </button>;
          })}
        </div>
      </div>

      <nav>
        <button className={tab === "trade" ? "active" : ""} onClick={() => setTab("trade")}><Zap size={13} />Trade</button>
        <button className={tab === "filters" ? "active" : ""} onClick={() => setTab("filters")}><SlidersHorizontal size={13} />Filters</button>
        <button className={tab === "guards" ? "active" : ""} onClick={() => setTab("guards")}><Gauge size={13} />Guards</button>
      </nav>

      {tab === "trade" && <div className="category-settings-body">
        <div className="v55-action-tabs" aria-label="Action settings">
          {ACTIONS.map((item) => <button key={item} className={action === item ? `active ${item}` : item} onClick={() => setAction(item)}>{item}</button>)}
        </div>

        <section className="v55-quick-amounts">
          <NumericField label="Quick spot buy" value={normalized.quickBuyEth} onChange={(quickBuyEth) => patch({ quickBuyEth })} suffix="ETH" step={0.001} min={0.0001} max={100} />
          <QuickPerpPresetEditor
            side="long"
            enabled={normalized.quickLongEnabled}
            collateral={normalized.quickLongCollateralEth}
            leverage={normalized.quickLongLeverage}
            onEnabled={(quickLongEnabled) => patch({ quickLongEnabled })}
            onCollateral={(quickLongCollateralEth) => patch({ quickLongCollateralEth })}
            onLeverage={(quickLongLeverage) => patch({ quickLongLeverage })}
          />
          <QuickPerpPresetEditor
            side="short"
            enabled={normalized.quickShortEnabled}
            collateral={normalized.quickShortCollateralEth}
            leverage={normalized.quickShortLeverage}
            onEnabled={(quickShortEnabled) => patch({ quickShortEnabled })}
            onCollateral={(quickShortCollateralEth) => patch({ quickShortCollateralEth })}
            onLeverage={(quickShortLeverage) => patch({ quickShortLeverage })}
          />
        </section>

        <section className="v55-execution-grid">
          <ToggleRow label="Automatic slippage" value={execution.autoSlippage} onChange={(autoSlippage) => patchExecution({ autoSlippage })} />
          <NumericField label={`${action[0].toUpperCase()}${action.slice(1)} slippage`} value={getActionSlippagePercent(execution, action)} onChange={setActionSlippage} suffix="%" step={0.25} min={0.1} max={100} />
          <ToggleRow label="Automatic network fee" value={execution.autoNetworkFee} onChange={(autoNetworkFee) => patchExecution({ autoNetworkFee })} />
          <NumericField label="Maximum network fee" value={execution.maxNetworkFeeEth} onChange={(maxNetworkFeeEth) => patchExecution({ maxNetworkFeeEth, autoNetworkFee: false })} suffix="ETH" step={0.000001} min={0} max={1} />
          <NumericField label="Quote deadline" value={execution.deadlineSeconds} onChange={(deadlineSeconds) => patchExecution({ deadlineSeconds })} suffix="sec" step={1} min={5} max={300} />
          <NumericField label="Maximum price impact" value={execution.maxPriceImpactPercent} onChange={(maxPriceImpactPercent) => patchExecution({ maxPriceImpactPercent })} suffix="%" step={0.5} min={0.1} max={100} />
        </section>

        <div className="category-setting-block">
          <span><RadioTower size={13} />Execution Boost</span>
          <div className="segmented-setting v55-route-setting">{ROUTES.map((route) => <button key={route} className={execution.executionRoute === route ? "active" : ""} onClick={() => patchExecution({ executionRoute: route })}>{route}</button>)}</div>
        </div>
        <div className="category-setting-block">
          <span><ShieldCheck size={13} />MEV route preference</span>
          <div className="segmented-setting v55-route-setting">{MEV_MODES.map((mode) => <button key={mode} className={execution.mevMode === mode ? "active" : ""} onClick={() => patchExecution({ mevMode: mode })}>{mode}</button>)}</div>
        </div>

        <p className="category-settings-note"><ShieldCheck size={14} /><span><b>No fake bribes.</b> Robinhood Chain ordering is not sold through a tip field. Execution Boost controls verified routing preferences; connected-wallet V55 trades still use the wallet&apos;s active RPC and enforce fresh min-output slippage.</span></p>
        <p className="category-settings-note"><TimerReset size={14} />Quick Long and Quick Short remain disabled until their exact amount-and-leverage preset is enabled. Markets and Movers never open a trading sidecar.</p>
      </div>}

      {tab === "filters" && <div className="category-settings-body">
        <div className="category-setting-pair">
          <NumericField label="Minimum market cap" value={normalized.minMarketCap} onChange={(minMarketCap) => patch({ minMarketCap })} suffix="$" step={1000} />
          <NumericField label="Minimum liquidity" value={normalized.minLiquidityEth} onChange={(minLiquidityEth) => patch({ minLiquidityEth })} suffix="ETH" step={0.1} />
        </div>
        <div className="category-setting-pair">
          <NumericField label="Minimum holders" value={normalized.minHolders} onChange={(minHolders) => patch({ minHolders })} step={1} />
          <NumericField label="Maximum age" value={normalized.maxAgeMinutes} onChange={(maxAgeMinutes) => patch({ maxAgeMinutes })} suffix="min · 0 off" step={5} />
        </div>
        <ToggleRow label="Positive momentum only" value={normalized.positiveOnly} onChange={(positiveOnly) => patch({ positiveOnly })} />
        <ToggleRow label="OG coins only" value={normalized.ogOnly} onChange={(ogOnly) => patch({ ogOnly })} />
        <ToggleRow label="Hide high wallet concentration" value={normalized.hideHighConcentration} onChange={(hideHighConcentration) => patch({ hideHighConcentration })} />
      </div>}

      {tab === "guards" && <div className="category-settings-body">
        <div className="v55-guard-summary">
          <span><small>Preset</small><strong>{activePreset}</strong></span>
          <span><small>Route</small><strong>{execution.executionRoute}</strong></span>
          <span><small>MEV</small><strong>{execution.mevMode}</strong></span>
          <span><small>Quote TTL</small><strong>{execution.deadlineSeconds}s</strong></span>
        </div>
        <ToggleRow label="MEV protection required when available" value={execution.mevMode !== "public"} onChange={(enabled) => patchExecution({ mevMode: enabled ? "auto" : "public" })} />
        <NumericField label="Maximum network fee" value={execution.maxNetworkFeeEth} onChange={(maxNetworkFeeEth) => patchExecution({ maxNetworkFeeEth })} suffix="ETH" step={0.000001} />
        <NumericField label="Maximum price impact" value={execution.maxPriceImpactPercent} onChange={(maxPriceImpactPercent) => patchExecution({ maxPriceImpactPercent })} suffix="%" step={0.5} min={0.1} max={100} />
        <p className="category-settings-note"><ShieldCheck size={14} />These values are saved only for <b>{label}</b>. Every Markets and Movers column keeps its own Standard, Fast, and Assault execution profile.</p>
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

function ToggleRow({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }) {
  return <button className="category-toggle-row" onClick={() => onChange(!value)}><span>{label}</span><i className={value ? "on" : ""}><b /></i></button>;
}
