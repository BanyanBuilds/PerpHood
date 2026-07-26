export type LiveTrade = {
  market: string;
  price: number;
  size: number;
  timestamp: number;
  side?: "buy" | "sell";
};

export type LiveCandle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type FeedState = "disabled" | "connecting" | "live" | "reconnecting" | "error";

export const MARKET_WS_URL = process.env.NEXT_PUBLIC_MARKET_WS_URL?.trim() ?? "";
export const MARKET_HISTORY_URL = process.env.NEXT_PUBLIC_MARKET_HISTORY_URL?.trim() ?? "";

export function bucketTime(timestampMs: number, seconds: number) {
  const unixSeconds = Math.floor(timestampMs / 1000);
  return Math.floor(unixSeconds / seconds) * seconds;
}

export function addTradeToCandles(current: LiveCandle[], trade: LiveTrade, seconds: number, max = 3000) {
  const time = bucketTime(trade.timestamp, seconds);
  const last = current.at(-1);
  if (last?.time === time) {
    const next = current.slice();
    next[next.length - 1] = {
      ...last,
      high: Math.max(last.high, trade.price),
      low: Math.min(last.low, trade.price),
      close: trade.price,
      volume: last.volume + trade.size,
    };
    return next;
  }
  const candle: LiveCandle = {
    time,
    open: last?.close ?? trade.price,
    high: Math.max(last?.close ?? trade.price, trade.price),
    low: Math.min(last?.close ?? trade.price, trade.price),
    close: trade.price,
    volume: trade.size,
  };
  return [...current, candle].slice(-max);
}

export function aggregateCandles(source: LiveCandle[], seconds: number) {
  const result: LiveCandle[] = [];
  for (const item of source) {
    const time = Math.floor(item.time / seconds) * seconds;
    const last = result.at(-1);
    if (last?.time === time) {
      last.high = Math.max(last.high, item.high);
      last.low = Math.min(last.low, item.low);
      last.close = item.close;
      last.volume += item.volume;
    } else {
      result.push({ ...item, time });
    }
  }
  return result;
}

export function parseTradeMessage(raw: unknown, expectedMarket: string): LiveTrade | null {
  if (!raw || typeof raw !== "object") return null;
  const message = raw as Record<string, unknown>;
  const payload = message.data && typeof message.data === "object" ? message.data as Record<string, unknown> : message;
  const market = String(payload.market ?? payload.slug ?? payload.token ?? payload.address ?? "");
  if (market && market.toLowerCase() !== expectedMarket.toLowerCase()) return null;
  const price = Number(payload.price);
  const size = Number(payload.size ?? payload.amount ?? payload.volume ?? 0);
  const timestampRaw = Number(payload.timestamp ?? payload.time ?? Date.now());
  const timestamp = timestampRaw < 10_000_000_000 ? timestampRaw * 1000 : timestampRaw;
  if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(size) || size < 0) return null;
  const side = payload.side === "buy" || payload.side === "sell" ? payload.side : undefined;
  return { market: market || expectedMarket, price, size, timestamp, side };
}
