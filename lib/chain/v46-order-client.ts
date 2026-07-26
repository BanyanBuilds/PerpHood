import { toWad, type Hex } from "./abi.ts";
import { configuredV45RouterAddress, readV45SessionState } from "./v45-account-client.ts";
import { bindV45SessionKey, loadV45Account, loadV45SessionKey } from "./v45-session-key.ts";
import {
  signV46Cancellation,
  signV46Order,
  usdMarketCapToEthWad,
  type V46OrderIntent,
  type V46OrderKind,
  type V46OrderSide,
  type V46SignedCancellation,
  type V46StoredOrder,
} from "./v46-order.ts";

export type V46EntryOrderInput = {
  market: Hex;
  side: V46OrderSide;
  kind: "limit" | "trigger";
  triggerCapUsd: number;
  amountEth: number;
  leverage: number;
  maintenanceMarginBps?: number;
  minOutput?: bigint;
  expiresInSeconds?: number;
};

export type V46ProtectionOrderInput = {
  market: Hex;
  direction: "long" | "short";
  kind: "take-profit" | "stop-loss" | "breakeven";
  positionId: bigint;
  triggerCapUsd: number;
  activationCapUsd?: number;
  expiresInSeconds?: number;
};

function id(prefix: string) {
  const value = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${value}`;
}

async function activeSession() {
  const material = loadV45SessionKey();
  const owner = loadV45Account();
  const router = configuredV45RouterAddress();
  if (!material || !owner || !router) throw new Error("Create an active V45 trading authorization before placing V46 orders.");
  const bound = bindV45SessionKey(material, owner);
  const session = await readV45SessionState(bound.sessionId, router);
  const now = Math.floor(Date.now() / 1_000);
  if (!session.active || session.validUntil <= now) throw new Error("The V45 trading authorization is inactive or expired.");
  if (session.publicKeyHash.toLowerCase() !== material.publicKeyHash.toLowerCase()) throw new Error("The browser session key no longer matches the on-chain authorization.");
  return { material, owner, router, bound, session, now };
}

async function submitOrder(intent: V46OrderIntent) {
  const material = loadV45SessionKey();
  if (!material) throw new Error("The V46 order signing key is unavailable.");
  const signedOrder = await signV46Order(material, intent);
  const response = await fetch("/api/v46/orders", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ signedOrder }),
  });
  const payload = await response.json() as { ok?: boolean; order?: V46StoredOrder; error?: string };
  if (!response.ok || !payload.ok || !payload.order) throw new Error(payload.error ?? "V46 order was rejected.");
  return payload.order;
}

export async function createV46EntryOrder(input: V46EntryOrderInput) {
  const { owner, router, bound, session, now } = await activeSession();
  const action = input.side === "buy" ? 1 : input.side === "long" ? 3 : 4;
  if ((session.actionBitmap & (1n << BigInt(action))) === 0n) throw new Error("The active session does not authorize this order action.");
  const comparator = input.kind === "limit"
    ? input.side === "short" ? "gte" : "lte"
    : input.side === "short" ? "lte" : "gte";
  const expiresAt = Math.min(session.validUntil, now + Math.max(60, input.expiresInSeconds ?? 6 * 60 * 60));
  const orderId = id("v46-order");
  return submitOrder({
    version: 46,
    orderId,
    clientOrderId: id("client"),
    owner,
    router,
    market: input.market,
    sessionId: bound.sessionId,
    kind: input.kind,
    side: input.side,
    action,
    comparator,
    triggerMarketCapEthWad: usdMarketCapToEthWad(input.triggerCapUsd).toString(),
    displayTriggerCapUsd: input.triggerCapUsd,
    activationMarketCapEthWad: "0",
    amountWei: input.side === "buy" ? toWad(input.amountEth).toString() : "0",
    collateralWei: input.side === "buy" ? "0" : toWad(input.amountEth).toString(),
    leverage: input.side === "buy" ? 1 : input.leverage,
    maintenanceMarginBps: input.side === "buy" ? 0 : input.maintenanceMarginBps ?? 200,
    positionId: "0",
    minOutput: String(input.minOutput ?? 0n),
    reduceOnly: false,
    createdAt: now,
    validAfter: now,
    expiresAt,
    maxAttempts: 5,
  });
}

export async function createV46ProtectionOrder(input: V46ProtectionOrderInput) {
  const { owner, router, bound, session, now } = await activeSession();
  const action = input.direction === "long" ? 5 : 6;
  if ((session.actionBitmap & (1n << BigInt(action))) === 0n) throw new Error("The active session does not authorize position closing.");
  const comparator = input.kind === "take-profit"
    ? input.direction === "long" ? "gte" : "lte"
    : input.direction === "long" ? "lte" : "gte";
  const expiresAt = Math.min(session.validUntil, now + Math.max(60, input.expiresInSeconds ?? 6 * 60 * 60));
  const orderId = id(`v46-${input.kind}`);
  return submitOrder({
    version: 46,
    orderId,
    clientOrderId: id("client"),
    owner,
    router,
    market: input.market,
    sessionId: bound.sessionId,
    kind: input.kind,
    side: input.direction,
    action,
    comparator,
    triggerMarketCapEthWad: usdMarketCapToEthWad(input.triggerCapUsd).toString(),
    displayTriggerCapUsd: input.triggerCapUsd,
    activationMarketCapEthWad: input.kind === "breakeven" ? usdMarketCapToEthWad(input.activationCapUsd ?? input.triggerCapUsd).toString() : "0",
    displayActivationCapUsd: input.kind === "breakeven" ? input.activationCapUsd ?? input.triggerCapUsd : undefined,
    amountWei: "0",
    collateralWei: "0",
    leverage: 1,
    maintenanceMarginBps: 0,
    positionId: input.positionId.toString(),
    minOutput: "0",
    reduceOnly: true,
    createdAt: now,
    validAfter: now,
    expiresAt,
    maxAttempts: 6,
  });
}

export async function listV46Orders(input: { owner?: string; market?: string } = {}) {
  const params = new URLSearchParams();
  if (input.owner) params.set("owner", input.owner);
  if (input.market) params.set("market", input.market);
  const response = await fetch(`/api/v46/orders${params.size ? `?${params}` : ""}`, { cache: "no-store" });
  const payload = await response.json() as { ok?: boolean; orders?: V46StoredOrder[]; error?: string };
  if (!response.ok || !payload.ok || !payload.orders) throw new Error(payload.error ?? "V46 orders could not be loaded.");
  return payload.orders;
}

export async function cancelV46Order(orderId: string) {
  const { material, owner, bound, now } = await activeSession();
  const intent = { version: 46 as const, orderId, owner, sessionId: bound.sessionId, createdAt: now, deadline: now + 120 };
  const signedCancellation: V46SignedCancellation = await signV46Cancellation(material, intent);
  const response = await fetch("/api/v46/orders/cancel", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ signedCancellation }),
  });
  const payload = await response.json() as { ok?: boolean; order?: V46StoredOrder; error?: string };
  if (!response.ok || !payload.ok || !payload.order) throw new Error(payload.error ?? "V46 order cancellation failed.");
  return payload.order;
}

export async function runV46KeeperOnce(orderId?: string) {
  const response = await fetch("/api/v46/keeper/run", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(orderId ? { orderId } : {}),
  });
  const payload = await response.json() as { ok?: boolean; result?: unknown; error?: string };
  if (!response.ok || !payload.ok) throw new Error(payload.error ?? "V46 keeper cycle failed.");
  return payload.result;
}
