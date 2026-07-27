export type TerminalCategoryKey = "new" | "cooking" | "migrated" | "movers" | "liked" | "market-cap";
export type QuickPresetKey = "P1" | "P2" | "P3";
export type LegacyFeePreset = "economy" | "fast" | "turbo" | "custom";
export type FeePreset = QuickPresetKey | LegacyFeePreset;
export type SlippageMode = "auto" | "custom";
export type DefaultLeverage = 2 | 5 | 10 | 20;
export type ExecutionRoute = "standard" | "fast" | "assault" | "protected";
export type MevMode = "auto" | "protected" | "public" | "redundant";
export type TradeActionProfile = "buy" | "sell" | "long" | "short" | "close";
export type QuickPerpPreset = { enabled: boolean; collateralEth: number; leverage: DefaultLeverage };

export type ExecutionPreset = {
  autoSlippage: boolean;
  buySlippagePercent: number;
  sellSlippagePercent: number;
  longSlippagePercent: number;
  shortSlippagePercent: number;
  closeSlippagePercent: number;
  autoNetworkFee: boolean;
  maxNetworkFeeEth: number;
  executionRoute: ExecutionRoute;
  mevMode: MevMode;
  deadlineSeconds: number;
  maxPriceImpactPercent: number;
};

export type ExecutionPresetMap = Record<QuickPresetKey, ExecutionPreset>;

export type CategoryTradingSettings = {
  quickBuyEth: number;
  quickLongEnabled: boolean;
  quickLongCollateralEth: number;
  quickLongLeverage: DefaultLeverage;
  quickShortEnabled: boolean;
  quickShortCollateralEth: number;
  quickShortLeverage: DefaultLeverage;

  /** V55 authoritative GMGN-style P1/P2/P3 execution profile. */
  activePreset: QuickPresetKey;
  executionPresets: ExecutionPresetMap;

  /** Legacy fields retained so existing synced V52/V53 state migrates without loss. */
  feePreset: FeePreset;
  buyPriorityFeeEth: number;
  sellPriorityFeeEth: number;
  slippageMode: SlippageMode;
  buySlippagePercent: number;
  sellSlippagePercent: number;
  defaultLeverage: DefaultLeverage;
  maxPriceImpactPercent: number;
  mevProtection: boolean;
  autoSlippage: boolean;

  positiveOnly: boolean;
  ogOnly: boolean;
  hideHighConcentration: boolean;
  minMarketCap: number;
  minLiquidityEth: number;
  minHolders: number;
  maxAgeMinutes: number;
};

export type TerminalCategorySettingsMap = Record<TerminalCategoryKey, CategoryTradingSettings>;

const P1: ExecutionPreset = {
  autoSlippage: true,
  buySlippagePercent: 3,
  sellSlippagePercent: 4,
  longSlippagePercent: 3,
  shortSlippagePercent: 3,
  closeSlippagePercent: 4,
  autoNetworkFee: true,
  maxNetworkFeeEth: 0.00002,
  executionRoute: "standard",
  mevMode: "auto",
  deadlineSeconds: 30,
  maxPriceImpactPercent: 8,
};
const P2: ExecutionPreset = {
  autoSlippage: true,
  buySlippagePercent: 6,
  sellSlippagePercent: 7,
  longSlippagePercent: 6,
  shortSlippagePercent: 6,
  closeSlippagePercent: 7,
  autoNetworkFee: true,
  maxNetworkFeeEth: 0.00005,
  executionRoute: "fast",
  mevMode: "redundant",
  deadlineSeconds: 24,
  maxPriceImpactPercent: 14,
};
const P3: ExecutionPreset = {
  autoSlippage: true,
  buySlippagePercent: 12,
  sellSlippagePercent: 15,
  longSlippagePercent: 12,
  shortSlippagePercent: 12,
  closeSlippagePercent: 15,
  autoNetworkFee: true,
  maxNetworkFeeEth: 0.0001,
  executionRoute: "assault",
  mevMode: "redundant",
  deadlineSeconds: 18,
  maxPriceImpactPercent: 22,
};

export const DEFAULT_EXECUTION_PRESETS: ExecutionPresetMap = { P1, P2, P3 };

const BASE: CategoryTradingSettings = {
  quickBuyEth: 0.01,
  quickLongEnabled: false,
  quickLongCollateralEth: 0.01,
  quickLongLeverage: 5,
  quickShortEnabled: false,
  quickShortCollateralEth: 0.01,
  quickShortLeverage: 5,
  activePreset: "P2",
  executionPresets: structuredClone(DEFAULT_EXECUTION_PRESETS),
  feePreset: "P2",
  buyPriorityFeeEth: P2.maxNetworkFeeEth,
  sellPriorityFeeEth: P2.maxNetworkFeeEth,
  slippageMode: "auto",
  buySlippagePercent: P2.buySlippagePercent,
  sellSlippagePercent: P2.sellSlippagePercent,
  defaultLeverage: 5,
  maxPriceImpactPercent: P2.maxPriceImpactPercent,
  mevProtection: true,
  autoSlippage: true,
  positiveOnly: false,
  ogOnly: false,
  hideHighConcentration: false,
  minMarketCap: 0,
  minLiquidityEth: 0,
  minHolders: 0,
  maxAgeMinutes: 0,
};

function withProfile(base: CategoryTradingSettings, activePreset: QuickPresetKey, patch: Partial<CategoryTradingSettings>): CategoryTradingSettings {
  const profile = DEFAULT_EXECUTION_PRESETS[activePreset];
  return {
    ...base,
    ...patch,
    activePreset,
    feePreset: activePreset,
    executionPresets: structuredClone(DEFAULT_EXECUTION_PRESETS),
    buyPriorityFeeEth: profile.maxNetworkFeeEth,
    sellPriorityFeeEth: profile.maxNetworkFeeEth,
    buySlippagePercent: profile.buySlippagePercent,
    sellSlippagePercent: profile.sellSlippagePercent,
    maxPriceImpactPercent: profile.maxPriceImpactPercent,
  };
}

export const DEFAULT_CATEGORY_SETTINGS: TerminalCategorySettingsMap = {
  new: withProfile(BASE, "P3", { quickBuyEth: 0.01, defaultLeverage: 5, quickLongLeverage: 5, quickShortLeverage: 5, maxAgeMinutes: 30 }),
  cooking: withProfile(BASE, "P2", { quickBuyEth: 0.01, defaultLeverage: 10, quickLongLeverage: 10, quickShortLeverage: 10 }),
  migrated: withProfile(BASE, "P1", { quickBuyEth: 0.03, defaultLeverage: 10, quickLongLeverage: 10, quickShortLeverage: 10 }),
  movers: withProfile(BASE, "P2", { quickBuyEth: 0.01, defaultLeverage: 10, quickLongLeverage: 10, quickShortLeverage: 10, positiveOnly: true }),
  liked: withProfile(BASE, "P2", { quickBuyEth: 0.01, defaultLeverage: 5, quickLongLeverage: 5, quickShortLeverage: 5 }),
  "market-cap": withProfile(BASE, "P1", { quickBuyEth: 0.03, defaultLeverage: 10, quickLongLeverage: 10, quickShortLeverage: 10 }),
};

function legacyPresetToQuick(value: FeePreset | undefined): QuickPresetKey {
  if (value === "P1" || value === "P2" || value === "P3") return value;
  if (value === "economy") return "P1";
  if (value === "turbo") return "P3";
  return "P2";
}

export function applyFeePreset(settings: CategoryTradingSettings, preset: FeePreset): CategoryTradingSettings {
  const activePreset = legacyPresetToQuick(preset);
  const profile = getExecutionPreset(settings, activePreset);
  return {
    ...settings,
    activePreset,
    feePreset: activePreset,
    buyPriorityFeeEth: profile.maxNetworkFeeEth,
    sellPriorityFeeEth: profile.maxNetworkFeeEth,
    buySlippagePercent: profile.buySlippagePercent,
    sellSlippagePercent: profile.sellSlippagePercent,
    autoSlippage: profile.autoSlippage,
    slippageMode: profile.autoSlippage ? "auto" : "custom",
    maxPriceImpactPercent: profile.maxPriceImpactPercent,
    mevProtection: profile.mevMode !== "public",
  };
}

export function getExecutionPreset(settings: Partial<CategoryTradingSettings>, key?: QuickPresetKey): ExecutionPreset {
  const presetKey = key ?? settings.activePreset ?? legacyPresetToQuick(settings.feePreset);
  const raw = settings.executionPresets?.[presetKey];
  const fallback = DEFAULT_EXECUTION_PRESETS[presetKey];
  if (!raw) return { ...fallback };
  return normalizeExecutionPreset({ ...fallback, ...raw });
}

export function getActiveExecutionPreset(settings: Partial<CategoryTradingSettings>) {
  const key = settings.activePreset ?? legacyPresetToQuick(settings.feePreset);
  return { key, profile: getExecutionPreset(settings, key) };
}

export function getActionSlippagePercent(profile: ExecutionPreset, action: TradeActionProfile) {
  if (action === "buy") return profile.buySlippagePercent;
  if (action === "sell") return profile.sellSlippagePercent;
  if (action === "long") return profile.longSlippagePercent;
  if (action === "short") return profile.shortSlippagePercent;
  return profile.closeSlippagePercent;
}

function normalizeExecutionPreset(preset: ExecutionPreset): ExecutionPreset {
  const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
  const route: ExecutionRoute = (["standard", "fast", "assault", "protected"] as string[]).includes(preset.executionRoute) ? preset.executionRoute : "standard";
  const mevMode: MevMode = (["auto", "protected", "public", "redundant"] as string[]).includes(preset.mevMode) ? preset.mevMode : "auto";
  return {
    autoSlippage: Boolean(preset.autoSlippage),
    buySlippagePercent: clamp(preset.buySlippagePercent, 0.1, 100),
    sellSlippagePercent: clamp(preset.sellSlippagePercent, 0.1, 100),
    longSlippagePercent: clamp(preset.longSlippagePercent, 0.1, 100),
    shortSlippagePercent: clamp(preset.shortSlippagePercent, 0.1, 100),
    closeSlippagePercent: clamp(preset.closeSlippagePercent, 0.1, 100),
    autoNetworkFee: Boolean(preset.autoNetworkFee),
    maxNetworkFeeEth: clamp(preset.maxNetworkFeeEth, 0, 1),
    executionRoute: route,
    mevMode,
    deadlineSeconds: Math.round(clamp(preset.deadlineSeconds, 5, 300)),
    maxPriceImpactPercent: clamp(preset.maxPriceImpactPercent, 0.1, 100),
  };
}

export function normalizeCategorySettings(input: CategoryTradingSettings): CategoryTradingSettings {
  const settings = { ...BASE, ...input };
  const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
  const activePreset = settings.activePreset ?? legacyPresetToQuick(settings.feePreset);
  const executionPresets: ExecutionPresetMap = {
    P1: normalizeExecutionPreset({ ...DEFAULT_EXECUTION_PRESETS.P1, ...(settings.executionPresets?.P1 ?? {}) }),
    P2: normalizeExecutionPreset({ ...DEFAULT_EXECUTION_PRESETS.P2, ...(settings.executionPresets?.P2 ?? {}) }),
    P3: normalizeExecutionPreset({ ...DEFAULT_EXECUTION_PRESETS.P3, ...(settings.executionPresets?.P3 ?? {}) }),
  };
  const active = executionPresets[activePreset];
  return {
    ...settings,
    quickBuyEth: clamp(settings.quickBuyEth, 0.0001, 100),
    quickLongEnabled: Boolean(settings.quickLongEnabled),
    quickLongCollateralEth: clamp(settings.quickLongCollateralEth, 0.0001, 100),
    quickLongLeverage: ([2, 5, 10, 20] as number[]).includes(settings.quickLongLeverage) ? settings.quickLongLeverage : settings.defaultLeverage,
    quickShortEnabled: Boolean(settings.quickShortEnabled),
    quickShortCollateralEth: clamp(settings.quickShortCollateralEth, 0.0001, 100),
    quickShortLeverage: ([2, 5, 10, 20] as number[]).includes(settings.quickShortLeverage) ? settings.quickShortLeverage : settings.defaultLeverage,
    activePreset,
    executionPresets,
    feePreset: activePreset,
    buyPriorityFeeEth: active.maxNetworkFeeEth,
    sellPriorityFeeEth: active.maxNetworkFeeEth,
    buySlippagePercent: active.buySlippagePercent,
    sellSlippagePercent: active.sellSlippagePercent,
    autoSlippage: active.autoSlippage,
    slippageMode: active.autoSlippage ? "auto" : "custom",
    maxPriceImpactPercent: active.maxPriceImpactPercent,
    mevProtection: active.mevMode !== "public",
    minMarketCap: clamp(settings.minMarketCap, 0, 1_000_000_000_000),
    minLiquidityEth: clamp(settings.minLiquidityEth, 0, 1_000_000),
    minHolders: Math.round(clamp(settings.minHolders, 0, 10_000_000)),
    maxAgeMinutes: Math.round(clamp(settings.maxAgeMinutes, 0, 525_600)),
  };
}

export function updateExecutionPreset(
  settings: CategoryTradingSettings,
  key: QuickPresetKey,
  patch: Partial<ExecutionPreset>,
): CategoryTradingSettings {
  const executionPresets = {
    ...settings.executionPresets,
    [key]: normalizeExecutionPreset({ ...getExecutionPreset(settings, key), ...patch }),
  };
  return normalizeCategorySettings({ ...settings, activePreset: key, feePreset: key, executionPresets });
}

export function getQuickPerpPreset(settings: CategoryTradingSettings, side: "long" | "short"): QuickPerpPreset {
  return side === "long"
    ? { enabled: settings.quickLongEnabled, collateralEth: settings.quickLongCollateralEth, leverage: settings.quickLongLeverage }
    : { enabled: settings.quickShortEnabled, collateralEth: settings.quickShortCollateralEth, leverage: settings.quickShortLeverage };
}
