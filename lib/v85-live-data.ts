export const V85_EVENT_KINDS = [
  "TOKEN_CREATED",
  "POOL_CREATED",
  "TRADE_EXECUTED",
  "PRICE_UPDATED",
  "MARKET_ENABLED",
  "POSITION_OPENED",
  "POSITION_UPDATED",
  "POSITION_CLOSED",
  "LIQUIDATION_OCCURRED",
  "RISK_WARNING",
] as const;

export type V85EventKind = (typeof V85_EVENT_KINDS)[number];

export type V85LiveEvent<TPayload extends Record<string, unknown> = Record<string, unknown>> = {
  id: string;
  kind: V85EventKind;
  chainId: number;
  blockNumber?: number;
  transactionHash?: `0x${string}`;
  marketAddress?: `0x${string}`;
  occurredAt: string;
  payload: TPayload;
};

export type V85StreamSnapshot = {
  cursor: string | null;
  events: V85LiveEvent[];
  dropped: number;
};

const EVENT_KIND_SET = new Set<string>(V85_EVENT_KINDS);
const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const HASH_RE = /^0x[a-fA-F0-9]{64}$/;

export function isV85EventKind(value: unknown): value is V85EventKind {
  return typeof value === "string" && EVENT_KIND_SET.has(value);
}

export function validateV85Event(input: unknown): V85LiveEvent {
  if (!input || typeof input !== "object") throw new Error("Live event must be an object.");
  const value = input as Partial<V85LiveEvent>;
  if (!isV85EventKind(value.kind)) throw new Error("Unsupported live event kind.");
  if (!Number.isSafeInteger(value.chainId) || Number(value.chainId) <= 0) throw new Error("chainId must be a positive integer.");
  if (value.blockNumber !== undefined && (!Number.isSafeInteger(value.blockNumber) || value.blockNumber < 0)) throw new Error("blockNumber must be a non-negative integer.");
  if (value.transactionHash !== undefined && !HASH_RE.test(value.transactionHash)) throw new Error("transactionHash must be a 32-byte hex value.");
  if (value.marketAddress !== undefined && !ADDRESS_RE.test(value.marketAddress)) throw new Error("marketAddress must be a 20-byte address.");
  if (!value.payload || typeof value.payload !== "object" || Array.isArray(value.payload)) throw new Error("payload must be an object.");

  const chainId = Number(value.chainId);
  const occurredAt = value.occurredAt ? new Date(value.occurredAt) : new Date();
  if (Number.isNaN(occurredAt.getTime())) throw new Error("occurredAt must be a valid timestamp.");

  return {
    id: typeof value.id === "string" && value.id.trim() ? value.id.trim() : createV85EventId(value.kind, chainId, value.transactionHash, value.blockNumber),
    kind: value.kind,
    chainId,
    blockNumber: value.blockNumber,
    transactionHash: value.transactionHash,
    marketAddress: value.marketAddress,
    occurredAt: occurredAt.toISOString(),
    payload: value.payload,
  };
}

export function createV85EventId(kind: V85EventKind, chainId: number, txHash?: string, blockNumber?: number) {
  const entropy = txHash ? txHash.slice(-16) : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${chainId}:${blockNumber ?? "pending"}:${kind}:${entropy}`;
}

export class V85LiveEventBuffer {
  private readonly events: V85LiveEvent[] = [];
  private dropped = 0;
  private readonly capacity: number;

  constructor(capacity = 2_000) {
    if (!Number.isSafeInteger(capacity) || capacity < 10) throw new Error("Live event capacity must be at least 10.");
    this.capacity = capacity;
  }

  publish(input: unknown) {
    const event = validateV85Event(input);
    if (this.events.some((existing) => existing.id === event.id)) return event;
    this.events.push(event);
    while (this.events.length > this.capacity) {
      this.events.shift();
      this.dropped += 1;
    }
    return event;
  }

  snapshot(afterId?: string | null, limit = 250): V85StreamSnapshot {
    const safeLimit = Math.max(1, Math.min(1_000, Math.floor(limit)));
    const index = afterId ? this.events.findIndex((event) => event.id === afterId) : -1;
    const start = index >= 0 ? index + 1 : Math.max(0, this.events.length - safeLimit);
    const events = this.events.slice(start, start + safeLimit);
    return { cursor: events.at(-1)?.id ?? afterId ?? null, events, dropped: this.dropped };
  }

  health() {
    return {
      capacity: this.capacity,
      retained: this.events.length,
      dropped: this.dropped,
      oldestEventAt: this.events[0]?.occurredAt ?? null,
      newestEventAt: this.events.at(-1)?.occurredAt ?? null,
      newestCursor: this.events.at(-1)?.id ?? null,
    };
  }
}
