export type TerminalCategoryKey = "new" | "cooking" | "migrated" | "movers" | "liked" | "market-cap";
export type FeePreset = "economy" | "fast" | "turbo" | "custom";
export type SlippageMode = "auto" | "custom";
export type DefaultLeverage = 2 | 5 | 10 | 20;
export type QuickPerpPreset = { enabled: boolean; collateralEth: number; leverage: DefaultLeverage };

export type CategoryTradingSettings = {
  quickBuyEth: number;
  quickLongEnabled: boolean;
  quickLongCollateralEth: number;
  quickLongLeverage: DefaultLeverage;
  quickShortEnabled: boolean;
  quickShortCollateralEth: number;
  quickShortLeverage: DefaultLeverage;
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

const BASE: CategoryTradingSettings = {
  quickBuyEth: 0.01,
  quickLongEnabled: false,
  quickLongCollateralEth: 0.01,
  quickLongLeverage: 5,
  quickShortEnabled: false,
  quickShortCollateralEth: 0.01,
  quickShortLeverage: 5,
  feePreset: "fast",
  buyPriorityFeeEth: 0.0002,
  sellPriorityFeeEth: 0.0003,
  slippageMode: "auto",
  buySlippagePercent: 12,
  sellSlippagePercent: 15,
  defaultLeverage: 5,
  maxPriceImpactPercent: 18,
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

export const FEE_PRESET_VALUES: Record<Exclude<FeePreset, "custom">, Pick<CategoryTradingSettings, "buyPriorityFeeEth" | "sellPriorityFeeEth">> = {
  economy: { buyPriorityFeeEth: 0.00005, sellPriorityFeeEth: 0.00008 },
  fast: { buyPriorityFeeEth: 0.0002, sellPriorityFeeEth: 0.0003 },
  turbo: { buyPriorityFeeEth: 0.0006, sellPriorityFeeEth: 0.0008 },
};

export const DEFAULT_CATEGORY_SETTINGS: TerminalCategorySettingsMap = {
  new: { ...BASE, quickBuyEth: 0.01, feePreset: "turbo", defaultLeverage: 5, quickLongLeverage: 5, quickShortLeverage: 5, buySlippagePercent: 18, sellSlippagePercent: 20, maxPriceImpactPercent: 24, maxAgeMinutes: 30 },
  cooking: { ...BASE, quickBuyEth: 0.01, feePreset: "fast", defaultLeverage: 10, quickLongLeverage: 10, quickShortLeverage: 10, buySlippagePercent: 12, sellSlippagePercent: 15, maxPriceImpactPercent: 18 },
  migrated: { ...BASE, quickBuyEth: 0.03, feePreset: "fast", defaultLeverage: 10, quickLongLeverage: 10, quickShortLeverage: 10, buySlippagePercent: 5, sellSlippagePercent: 7, maxPriceImpactPercent: 10 },
  movers: { ...BASE, quickBuyEth: 0.01, feePreset: "turbo", defaultLeverage: 10, quickLongLeverage: 10, quickShortLeverage: 10, buySlippagePercent: 12, sellSlippagePercent: 15, maxPriceImpactPercent: 18, positiveOnly: true },
  liked: { ...BASE, quickBuyEth: 0.01, feePreset: "fast", defaultLeverage: 5, quickLongLeverage: 5, quickShortLeverage: 5 },
  "market-cap": { ...BASE, quickBuyEth: 0.03, feePreset: "fast", defaultLeverage: 10, quickLongLeverage: 10, quickShortLeverage: 10, buySlippagePercent: 5, sellSlippagePercent: 7, maxPriceImpactPercent: 10 },
};

export function applyFeePreset(settings: CategoryTradingSettings, preset: FeePreset): CategoryTradingSettings {
  if (preset === "custom") return { ...settings, feePreset: preset };
  return { ...settings, feePreset: preset, ...FEE_PRESET_VALUES[preset] };
}

export function normalizeCategorySettings(settings: CategoryTradingSettings): CategoryTradingSettings {
  const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
  return {
    ...settings,
    quickBuyEth: clamp(settings.quickBuyEth, 0.0001, 100),
    quickLongEnabled: Boolean(settings.quickLongEnabled),
    quickLongCollateralEth: clamp(settings.quickLongCollateralEth, 0.0001, 100),
    quickLongLeverage: ([2, 5, 10, 20] as number[]).includes(settings.quickLongLeverage) ? settings.quickLongLeverage : settings.defaultLeverage,
    quickShortEnabled: Boolean(settings.quickShortEnabled),
    quickShortCollateralEth: clamp(settings.quickShortCollateralEth, 0.0001, 100),
    quickShortLeverage: ([2, 5, 10, 20] as number[]).includes(settings.quickShortLeverage) ? settings.quickShortLeverage : settings.defaultLeverage,
    buyPriorityFeeEth: clamp(settings.buyPriorityFeeEth, 0, 1),
    sellPriorityFeeEth: clamp(settings.sellPriorityFeeEth, 0, 1),
    buySlippagePercent: clamp(settings.buySlippagePercent, 0.1, 100),
    sellSlippagePercent: clamp(settings.sellSlippagePercent, 0.1, 100),
    maxPriceImpactPercent: clamp(settings.maxPriceImpactPercent, 0.1, 100),
    minMarketCap: clamp(settings.minMarketCap, 0, 1_000_000_000_000),
    minLiquidityEth: clamp(settings.minLiquidityEth, 0, 1_000_000),
    minHolders: Math.round(clamp(settings.minHolders, 0, 10_000_000)),
    maxAgeMinutes: Math.round(clamp(settings.maxAgeMinutes, 0, 525_600)),
  };
}

export function getQuickPerpPreset(settings: CategoryTradingSettings, side: "long" | "short"): QuickPerpPreset {
  return side === "long"
    ? { enabled: settings.quickLongEnabled, collateralEth: settings.quickLongCollateralEth, leverage: settings.quickLongLeverage }
    : { enabled: settings.quickShortEnabled, collateralEth: settings.quickShortCollateralEth, leverage: settings.quickShortLeverage };
}
