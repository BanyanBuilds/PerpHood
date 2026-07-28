export type V83OrderAction = "spot-buy" | "spot-sell" | "long" | "short";
export type V83OrderPhase = "idle" | "validating" | "quoting" | "risk-check" | "simulating" | "awaiting-signature" | "submitting" | "confirming" | "confirmed" | "failed";

export type V83OrderRequest = {
  requestId: string;
  wallet: string;
  market: string;
  action: V83OrderAction;
  collateralEth: number;
  leverage: number;
  slippageBps: number;
  deadlineSeconds: number;
};

export type V83OrderQuote = {
  requestId: string;
  markPriceWad: bigint;
  notionalEth: number;
  feeEth: number;
  priceImpactBps: number;
  liquidationPriceWad?: bigint;
  expiresAt: number;
};

export type V83RiskSnapshot = {
  marketEnabled: boolean;
  oracleFresh: boolean;
  creatorBlocked: boolean;
  insuranceHealthy: boolean;
  availableLiquidityEth: number;
  maxLeverage: number;
};

export type V83OrderReceipt = {
  requestId: string;
  transactionHash: `0x${string}`;
  blockNumber: bigint;
  filledNotionalEth: number;
  averagePriceWad: bigint;
  feeEth: number;
};

export type V83OrderEvent = {
  requestId: string;
  phase: V83OrderPhase;
  at: number;
  message: string;
};

export class V83OrderError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "V83OrderError";
  }
}

export function validateV83Order(request: V83OrderRequest): void {
  if (!/^0x[a-fA-F0-9]{40}$/.test(request.wallet)) throw new V83OrderError("INVALID_WALLET", "Connect a valid wallet.");
  if (!/^0x[a-fA-F0-9]{40}$/.test(request.market)) throw new V83OrderError("INVALID_MARKET", "Market address is invalid.");
  if (!Number.isFinite(request.collateralEth) || request.collateralEth <= 0) throw new V83OrderError("INVALID_COLLATERAL", "Collateral must be greater than zero.");
  const leverage = request.action === "spot-buy" || request.action === "spot-sell" ? 1 : request.leverage;
  if (!Number.isInteger(leverage) || leverage < 1 || leverage > 20) throw new V83OrderError("INVALID_LEVERAGE", "Leverage must be between 1x and 20x.");
  if (!Number.isInteger(request.slippageBps) || request.slippageBps < 1 || request.slippageBps > 5_000) throw new V83OrderError("INVALID_SLIPPAGE", "Slippage must be between 0.01% and 50%.");
  if (!Number.isInteger(request.deadlineSeconds) || request.deadlineSeconds < 15 || request.deadlineSeconds > 1_800) throw new V83OrderError("INVALID_DEADLINE", "Order deadline must be between 15 seconds and 30 minutes.");
}

export function enforceV83Risk(request: V83OrderRequest, quote: V83OrderQuote, risk: V83RiskSnapshot, now = Date.now()): void {
  if (!risk.marketEnabled) throw new V83OrderError("MARKET_DISABLED", "This market is not open for trading.");
  if (!risk.oracleFresh) throw new V83OrderError("STALE_ORACLE", "The market oracle is stale.");
  if (risk.creatorBlocked && (request.action === "long" || request.action === "short")) throw new V83OrderError("CREATOR_BLOCKED", "Creator-linked wallets cannot trade perps on this market.");
  if (!risk.insuranceHealthy && (request.action === "long" || request.action === "short")) throw new V83OrderError("INSURANCE_UNHEALTHY", "Perpetual trading is temporarily close-only.");
  if (quote.expiresAt <= now) throw new V83OrderError("QUOTE_EXPIRED", "The quote expired. Refresh it before signing.");
  if (quote.requestId !== request.requestId) throw new V83OrderError("QUOTE_MISMATCH", "Quote does not match this order.");
  if (quote.notionalEth > risk.availableLiquidityEth) throw new V83OrderError("INSUFFICIENT_LIQUIDITY", "The requested size exceeds available liquidity.");
  if (request.leverage > risk.maxLeverage) throw new V83OrderError("LEVERAGE_CAP", `This market currently supports up to ${risk.maxLeverage}x leverage.`);
  if (quote.priceImpactBps > request.slippageBps) throw new V83OrderError("PRICE_IMPACT", "Estimated price impact exceeds the selected slippage limit.");
}

export class V83OrderEventBus {
  private listeners = new Set<(event: V83OrderEvent) => void>();
  subscribe(listener: (event: V83OrderEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  emit(event: V83OrderEvent): void {
    for (const listener of this.listeners) listener(event);
  }
}

export const v83OrderEventBus = new V83OrderEventBus();
