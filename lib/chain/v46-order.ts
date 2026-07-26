import type { Hex } from "./abi.ts";
import {
  deriveV45SessionId,
  signV45CanonicalPayload,
  verifyV45CanonicalPayload,
  type V45SessionKeyMaterial,
  type V45SignedCanonicalPayload,
} from "./v45-session-key.ts";

export const V46_ORDER_VERSION = 46 as const;
export const V46_ETH_USD_REFERENCE = 3_200;

export type V46OrderKind = "limit" | "trigger" | "take-profit" | "stop-loss" | "breakeven";
export type V46OrderSide = "buy" | "long" | "short";
export type V46OrderComparator = "lte" | "gte";
export type V46OrderStatus = "armed" | "watching" | "filling" | "filled" | "cancelled" | "expired" | "failed";

export type V46OrderIntent = {
  version: 46;
  orderId: string;
  clientOrderId: string;
  owner: Hex;
  router: Hex;
  market: Hex;
  sessionId: Hex;
  kind: V46OrderKind;
  side: V46OrderSide;
  action: 1 | 3 | 4 | 5 | 6;
  comparator: V46OrderComparator;
  triggerMarketCapEthWad: string;
  displayTriggerCapUsd: number;
  activationMarketCapEthWad: string;
  displayActivationCapUsd?: number;
  amountWei: string;
  collateralWei: string;
  leverage: number;
  maintenanceMarginBps: number;
  positionId: string;
  minOutput: string;
  reduceOnly: boolean;
  createdAt: number;
  validAfter: number;
  expiresAt: number;
  maxAttempts: number;
};

export type V46SignedOrder = {
  intent: V46OrderIntent;
  orderHash: Hex;
  signature: string;
  publicJwk: JsonWebKey;
  publicKeyHash: Hex;
};

export type V46CancellationIntent = {
  version: 46;
  orderId: string;
  owner: Hex;
  sessionId: Hex;
  createdAt: number;
  deadline: number;
};

export type V46SignedCancellation = {
  intent: V46CancellationIntent;
  cancellationHash: Hex;
  signature: string;
  publicJwk: JsonWebKey;
  publicKeyHash: Hex;
};

export type V46StoredOrder = V46SignedOrder & {
  status: V46OrderStatus;
  attempts: number;
  nextAttemptAt: number;
  activatedAt?: number;
  filledAt?: number;
  cancelledAt?: number;
  failedAt?: number;
  lastCheckedAt?: number;
  lastMarketCapEthWad?: string;
  transactionHash?: Hex;
  blockNumber?: number;
  failureReason?: string;
  filledPositionId?: string;
  filledTokenAmountWad?: string;
  filledCollateralWei?: string;
  filledNotionalWei?: string;
  filledEntryPriceWad?: string;
  filledLiquidationPriceWad?: string;
  filledGrossWethWei?: string;
  filledPayoutWei?: string;
  filledPnlWei?: string;
  filledMarketCapEthWad?: string;
  leaseOwner?: string;
  leaseExpiresAt?: number;
};

export type V46OrderEvaluation = {
  due: boolean;
  activate: boolean;
  expire: boolean;
  reason: string;
};

function assertAddress(value: string, label: string) {
  if (!/^0x[0-9a-fA-F]{40}$/.test(value)) throw new Error(`${label} is not a valid address.`);
  return value.toLowerCase() as Hex;
}

function assertBytes32(value: string, label: string) {
  if (!/^0x[0-9a-fA-F]{64}$/.test(value)) throw new Error(`${label} is not bytes32.`);
  return value.toLowerCase() as Hex;
}

function integer(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label} must be a non-negative integer.`);
  return value;
}

function uintString(value: string, label: string) {
  if (!/^\d+$/.test(value) || BigInt(value) < 0n) throw new Error(`${label} must be an unsigned integer string.`);
  return String(BigInt(value));
}

export function canonicalV46OrderIntent(input: V46OrderIntent) {
  return JSON.stringify({
    version: input.version,
    orderId: input.orderId,
    clientOrderId: input.clientOrderId,
    owner: assertAddress(input.owner, "Owner"),
    router: assertAddress(input.router, "Router"),
    market: assertAddress(input.market, "Market"),
    sessionId: assertBytes32(input.sessionId, "Session ID"),
    kind: input.kind,
    side: input.side,
    action: input.action,
    comparator: input.comparator,
    triggerMarketCapEthWad: uintString(input.triggerMarketCapEthWad, "Trigger market cap"),
    displayTriggerCapUsd: Number(input.displayTriggerCapUsd),
    activationMarketCapEthWad: uintString(input.activationMarketCapEthWad, "Activation market cap"),
    displayActivationCapUsd: input.displayActivationCapUsd === undefined ? null : Number(input.displayActivationCapUsd),
    amountWei: uintString(input.amountWei, "Amount"),
    collateralWei: uintString(input.collateralWei, "Collateral"),
    leverage: integer(input.leverage, "Leverage"),
    maintenanceMarginBps: integer(input.maintenanceMarginBps, "Maintenance margin"),
    positionId: uintString(input.positionId, "Position ID"),
    minOutput: uintString(input.minOutput, "Minimum output"),
    reduceOnly: Boolean(input.reduceOnly),
    createdAt: integer(input.createdAt, "Created time"),
    validAfter: integer(input.validAfter, "Valid-after time"),
    expiresAt: integer(input.expiresAt, "Expiry time"),
    maxAttempts: integer(input.maxAttempts, "Maximum attempts"),
  });
}

export function validateV46OrderIntent(intent: V46OrderIntent) {
  canonicalV46OrderIntent(intent);
  if (intent.version !== V46_ORDER_VERSION) throw new Error("Unsupported V46 order version.");
  if (!intent.orderId || intent.orderId.length > 128 || !intent.clientOrderId || intent.clientOrderId.length > 128) throw new Error("Order identifiers are invalid.");
  if (!(["limit", "trigger", "take-profit", "stop-loss", "breakeven"] as const).includes(intent.kind)) throw new Error("Unsupported V46 order kind.");
  if (!(["buy", "long", "short"] as const).includes(intent.side)) throw new Error("Unsupported V46 order side.");
  if (!(["lte", "gte"] as const).includes(intent.comparator)) throw new Error("Unsupported V46 comparator.");
  if (![1, 3, 4, 5, 6].includes(intent.action)) throw new Error("Unsupported V46 action.");
  if (intent.expiresAt <= intent.createdAt || intent.expiresAt <= intent.validAfter) throw new Error("Order expiry must be after creation and activation.");
  if (intent.maxAttempts < 1 || intent.maxAttempts > 12) throw new Error("Order retry count is outside the supported range.");
  if (intent.reduceOnly) {
    if (![5, 6].includes(intent.action) || BigInt(intent.positionId) <= 0n || intent.side === "buy") throw new Error("Reduce-only orders must close a concrete long or short position.");
  } else {
    if (![1, 3, 4].includes(intent.action) || BigInt(intent.positionId) !== 0n) throw new Error("Entry orders cannot carry a close-position ID.");
    if (intent.side === "buy" && intent.action !== 1) throw new Error("Spot entry orders must use action 1.");
    if (intent.side === "long" && intent.action !== 3) throw new Error("Long entry orders must use action 3.");
    if (intent.side === "short" && intent.action !== 4) throw new Error("Short entry orders must use action 4.");
  }
  if (intent.side !== "buy" && (intent.leverage < 2 || intent.leverage > 20)) throw new Error("Perp leverage must be between 2× and 20×.");
  if (intent.side === "buy" && intent.leverage !== 1) throw new Error("Spot orders must use 1× leverage.");
  if (!Number.isFinite(intent.displayTriggerCapUsd) || intent.displayTriggerCapUsd <= 0) throw new Error("Display trigger market cap must be positive.");
  if (BigInt(intent.triggerMarketCapEthWad) <= 0n) throw new Error("Trigger market cap must be positive.");
  if (["take-profit", "stop-loss", "breakeven"].includes(intent.kind) && !intent.reduceOnly) throw new Error("Protective orders must be reduce-only.");
  if (intent.kind === "breakeven") {
    if (BigInt(intent.activationMarketCapEthWad) <= 0n) throw new Error("Breakeven activation market cap must be positive.");
    if (!Number.isFinite(intent.displayActivationCapUsd) || Number(intent.displayActivationCapUsd) <= 0) throw new Error("Breakeven display activation market cap must be positive.");
  }
  return intent;
}

export function canonicalV46CancellationIntent(input: V46CancellationIntent) {
  if (input.version !== V46_ORDER_VERSION) throw new Error("Unsupported V46 cancellation version.");
  if (!input.orderId || input.orderId.length > 128) throw new Error("Cancellation order ID is invalid.");
  if (input.deadline <= input.createdAt) throw new Error("Cancellation deadline is invalid.");
  return JSON.stringify({
    version: input.version,
    orderId: input.orderId,
    owner: assertAddress(input.owner, "Owner"),
    sessionId: assertBytes32(input.sessionId, "Session ID"),
    createdAt: integer(input.createdAt, "Cancellation time"),
    deadline: integer(input.deadline, "Cancellation deadline"),
  });
}

export async function signV46Cancellation(material: V45SessionKeyMaterial, intent: V46CancellationIntent): Promise<V46SignedCancellation> {
  const expectedSessionId = deriveV45SessionId(intent.owner, material.publicKeyHash);
  if (expectedSessionId.toLowerCase() !== intent.sessionId.toLowerCase()) throw new Error("Cancellation session does not match the session key.");
  const signed = await signV45CanonicalPayload(material, canonicalV46CancellationIntent(intent));
  return { intent, cancellationHash: signed.payloadHash, signature: signed.signature, publicJwk: signed.publicJwk, publicKeyHash: signed.publicKeyHash };
}

export async function verifyV46SignedCancellation(signed: V46SignedCancellation) {
  if (deriveV45SessionId(signed.intent.owner, signed.publicKeyHash).toLowerCase() !== signed.intent.sessionId.toLowerCase()) return false;
  const envelope: V45SignedCanonicalPayload = { payloadHash: signed.cancellationHash, signature: signed.signature, publicJwk: signed.publicJwk, publicKeyHash: signed.publicKeyHash };
  return verifyV45CanonicalPayload(envelope, canonicalV46CancellationIntent(signed.intent));
}

export async function signV46Order(material: V45SessionKeyMaterial, intent: V46OrderIntent): Promise<V46SignedOrder> {
  validateV46OrderIntent(intent);
  const expectedSessionId = deriveV45SessionId(intent.owner, material.publicKeyHash);
  if (expectedSessionId.toLowerCase() !== intent.sessionId.toLowerCase()) throw new Error("V46 order session does not match the session key.");
  const signed = await signV45CanonicalPayload(material, canonicalV46OrderIntent(intent));
  return {
    intent,
    orderHash: signed.payloadHash,
    signature: signed.signature,
    publicJwk: signed.publicJwk,
    publicKeyHash: signed.publicKeyHash,
  };
}

export async function verifyV46SignedOrder(signed: V46SignedOrder) {
  validateV46OrderIntent(signed.intent);
  if (deriveV45SessionId(signed.intent.owner, signed.publicKeyHash).toLowerCase() !== signed.intent.sessionId.toLowerCase()) return false;
  const envelope: V45SignedCanonicalPayload = {
    payloadHash: signed.orderHash,
    signature: signed.signature,
    publicJwk: signed.publicJwk,
    publicKeyHash: signed.publicKeyHash,
  };
  return verifyV45CanonicalPayload(envelope, canonicalV46OrderIntent(signed.intent));
}

export function compareV46Trigger(comparator: V46OrderComparator, current: bigint, trigger: bigint) {
  return comparator === "lte" ? current <= trigger : current >= trigger;
}

export function evaluateV46Order(order: V46StoredOrder, currentMarketCapEthWad: bigint, nowSeconds: number): V46OrderEvaluation {
  if (!["armed", "watching"].includes(order.status)) return { due: false, activate: false, expire: false, reason: `Order is ${order.status}.` };
  if (nowSeconds >= order.intent.expiresAt) return { due: false, activate: false, expire: true, reason: "Order expired." };
  if (nowSeconds < order.intent.validAfter || nowSeconds < Math.ceil(order.nextAttemptAt / 1_000)) return { due: false, activate: false, expire: false, reason: "Order is not eligible yet." };
  const trigger = BigInt(order.intent.triggerMarketCapEthWad);
  if (order.intent.kind !== "breakeven") {
    const due = compareV46Trigger(order.intent.comparator, currentMarketCapEthWad, trigger);
    return { due, activate: false, expire: false, reason: due ? "Trigger crossed." : "Waiting for trigger." };
  }
  const activation = BigInt(order.intent.activationMarketCapEthWad);
  if (order.status === "armed") {
    const activate = order.intent.side === "long" ? currentMarketCapEthWad >= activation : currentMarketCapEthWad <= activation;
    return { due: false, activate, expire: false, reason: activate ? "Breakeven order activated." : "Waiting for breakeven activation." };
  }
  const due = compareV46Trigger(order.intent.comparator, currentMarketCapEthWad, trigger);
  return { due, activate: false, expire: false, reason: due ? "Breakeven retrace crossed." : "Breakeven protection is watching." };
}

export function usdMarketCapToEthWad(usdMarketCap: number, ethUsd = V46_ETH_USD_REFERENCE) {
  if (!Number.isFinite(usdMarketCap) || usdMarketCap <= 0 || !Number.isFinite(ethUsd) || ethUsd <= 0) throw new Error("Market-cap conversion input is invalid.");
  return BigInt(Math.round(usdMarketCap / ethUsd * 1e9)) * 1_000_000_000n;
}

export function retryDelayMs(attempts: number) {
  return Math.min(60_000, 1_000 * 2 ** Math.max(0, attempts - 1));
}
