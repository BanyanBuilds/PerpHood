import {
  FP_WAD,
  marginalPriceWad,
  quoteFixedBuyExactTokens,
  quoteFixedSell,
} from "../fixed-point-battle-curve.ts";
import type { V24VerifiedPoolState } from "./v24-verified-action.ts";

export type V24PositionSnapshot = {
  id: string;
  owner: string;
  direction: "long" | "short";
  collateralWad: bigint;
  tokenAmountWad: bigint;
  debtWad: bigint;
  lockedShortProceedsWad: bigint;
};

export type V24CommittedEvent = {
  sequence: bigint;
  timestampMs: number;
  blockNumber: bigint;
  transactionHash: `0x${string}`;
  action: number;
  marginalPriceWad: bigint;
  marketCapWad: bigint;
  poolWethWad: bigint;
  reservedWethWad: bigint;
  curveSoldTokenWad: bigint;
  positionsRoot: `0x${string}`;
  balancesRoot: `0x${string}`;
  stateHash: `0x${string}`;
};

export type V24Candle = {
  intervalSeconds: 1 | 15 | 30;
  bucketStartMs: number;
  openWad: bigint;
  highWad: bigint;
  lowWad: bigint;
  closeWad: bigint;
  firstSequence: bigint;
  lastSequence: bigint;
  eventCount: number;
};

export type V24ExecutablePnl = {
  positionId: string;
  direction: "long" | "short";
  executablePayoutWad: bigint;
  pnlWad: bigint;
  closeFeeWad: bigint;
  priceWad: bigint;
  liquidatable: boolean;
  quoteError?: string;
};

export type V24IndexedSnapshot = {
  event: V24CommittedEvent;
  candles: Record<1 | 15 | 30, V24Candle>;
  pnl: Record<string, V24ExecutablePnl>;
  aggregatePnlWad: bigint;
  processingMicros: number;
};

function candleBucket(timestampMs: number, intervalSeconds: number) {
  const width = intervalSeconds * 1_000;
  return Math.floor(timestampMs / width) * width;
}

function nextCandle(event: V24CommittedEvent, intervalSeconds: 1 | 15 | 30, previous?: V24Candle): V24Candle {
  const bucketStartMs = candleBucket(event.timestampMs, intervalSeconds);
  if (!previous || previous.bucketStartMs !== bucketStartMs) {
    return {
      intervalSeconds,
      bucketStartMs,
      openWad: event.marginalPriceWad,
      highWad: event.marginalPriceWad,
      lowWad: event.marginalPriceWad,
      closeWad: event.marginalPriceWad,
      firstSequence: event.sequence,
      lastSequence: event.sequence,
      eventCount: 1,
    };
  }
  return {
    ...previous,
    highWad: event.marginalPriceWad > previous.highWad ? event.marginalPriceWad : previous.highWad,
    lowWad: event.marginalPriceWad < previous.lowWad ? event.marginalPriceWad : previous.lowWad,
    closeWad: event.marginalPriceWad,
    lastSequence: event.sequence,
    eventCount: previous.eventCount + 1,
  };
}

export function executablePnlAtState(state: Pick<V24VerifiedPoolState, "curveSoldTokenWad">, position: V24PositionSnapshot): V24ExecutablePnl {
  const priceWad = marginalPriceWad(state.curveSoldTokenWad);
  try {
    if (position.direction === "long") {
      const quote = quoteFixedSell(state.curveSoldTokenWad, position.tokenAmountWad);
      const executablePayoutWad = quote.netWethWad > position.debtWad ? quote.netWethWad - position.debtWad : 0n;
      return {
        positionId: position.id,
        direction: position.direction,
        executablePayoutWad,
        pnlWad: executablePayoutWad - position.collateralWad,
        closeFeeWad: quote.feeWethWad,
        priceWad,
        liquidatable: executablePayoutWad === 0n,
      };
    }
    const quote = quoteFixedBuyExactTokens(state.curveSoldTokenWad, position.tokenAmountWad);
    const availableWad = position.collateralWad + position.lockedShortProceedsWad;
    const executablePayoutWad = availableWad > quote.grossWethWad ? availableWad - quote.grossWethWad : 0n;
    return {
      positionId: position.id,
      direction: position.direction,
      executablePayoutWad,
      pnlWad: executablePayoutWad - position.collateralWad,
      closeFeeWad: quote.feeWethWad,
      priceWad,
      liquidatable: executablePayoutWad === 0n,
    };
  } catch (error) {
    return {
      positionId: position.id,
      direction: position.direction,
      executablePayoutWad: 0n,
      pnlWad: -position.collateralWad,
      closeFeeWad: 0n,
      priceWad,
      liquidatable: true,
      quoteError: error instanceof Error ? error.message : "Executable close unavailable.",
    };
  }
}

/**
 * One ordered event indexer feeds both candles and executable PNL. A caller may
 * optimistically ingest a sequencer event, but a chain event with the same
 * sequence must match its state hash before the frame is considered final.
 */
export class V24EventIndexer {
  #lastSequence = -1n;
  #lastStateHash = `0x${"00".repeat(32)}` as `0x${string}`;
  #candles = new Map<1 | 15 | 30, V24Candle>();
  #history = new Map<1 | 15 | 30, V24Candle[]>();

  constructor() {
    this.#history.set(1, []);
    this.#history.set(15, []);
    this.#history.set(30, []);
  }

  get lastSequence() { return this.#lastSequence; }
  get lastStateHash() { return this.#lastStateHash; }

  ingest(event: V24CommittedEvent, positions: V24PositionSnapshot[]): V24IndexedSnapshot {
    const started = performance.now();
    if (event.sequence !== this.#lastSequence + 1n) {
      throw new Error(`V24 event gap: expected ${this.#lastSequence + 1n}, received ${event.sequence}.`);
    }
    const candles = {} as Record<1 | 15 | 30, V24Candle>;
    for (const interval of [1, 15, 30] as const) {
      const previous = this.#candles.get(interval);
      const current = nextCandle(event, interval, previous);
      if (previous && previous.bucketStartMs !== current.bucketStartMs) this.#history.get(interval)!.push(previous);
      this.#candles.set(interval, current);
      candles[interval] = current;
    }

    const pnl: Record<string, V24ExecutablePnl> = {};
    let aggregatePnlWad = 0n;
    for (const position of positions) {
      const quote = executablePnlAtState({ curveSoldTokenWad: event.curveSoldTokenWad }, position);
      pnl[position.id] = quote;
      aggregatePnlWad += quote.pnlWad;
    }

    this.#lastSequence = event.sequence;
    this.#lastStateHash = event.stateHash;
    const processingMicros = (performance.now() - started) * 1_000;
    return { event, candles, pnl, aggregatePnlWad, processingMicros };
  }

  history(interval: 1 | 15 | 30) {
    const completed = this.#history.get(interval) ?? [];
    const current = this.#candles.get(interval);
    return current ? [...completed, current] : [...completed];
  }
}

export function wadToDecimal(value: bigint, decimals = 6) {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const whole = absolute / FP_WAD;
  const fraction = (absolute % FP_WAD).toString().padStart(18, "0").slice(0, decimals);
  return `${negative ? "-" : ""}${whole}.${fraction}`;
}
