"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useBattleRealtime } from "./useBattleRealtime";
import {
  MARKET_HISTORY_URL,
  MARKET_WS_URL,
  addTradeToCandles,
  aggregateCandles,
  parseTradeMessage,
  type FeedState,
  type LiveCandle,
  type LiveTrade,
} from "@/lib/live-market";

export function useLiveMarket(market: string, timeframeSeconds: number) {
  const battleFrame = useBattleRealtime(market);
  const [baseCandles, setBaseCandles] = useState<LiveCandle[]>([]);
  const [trades, setTrades] = useState<LiveTrade[]>([]);
  const [state, setState] = useState<FeedState>(MARKET_WS_URL ? "connecting" : "disabled");
  const [error, setError] = useState<string>("");
  const retryRef = useRef(0);
  const localSequenceRef = useRef(0);
  const localPriceRef = useRef<number | null>(null);

  useEffect(() => {
    setBaseCandles([]);
    setTrades([]);
    setError("");
    localSequenceRef.current = 0;
    localPriceRef.current = null;
    if (!market) return;

    const controller = new AbortController();
    if (MARKET_HISTORY_URL) {
      const separator = MARKET_HISTORY_URL.includes("?") ? "&" : "?";
      fetch(`${MARKET_HISTORY_URL}${separator}market=${encodeURIComponent(market)}&interval=1s&limit=3000`, { signal: controller.signal })
        .then((response) => response.ok ? response.json() : Promise.reject(new Error(`History request failed (${response.status})`)))
        .then((body: unknown) => {
          const rows = Array.isArray(body) ? body : body && typeof body === "object" && Array.isArray((body as { candles?: unknown[] }).candles) ? (body as { candles: unknown[] }).candles : [];
          const parsed = rows.flatMap((row): LiveCandle[] => {
            if (!row || typeof row !== "object") return [];
            const value = row as Record<string, unknown>;
            const timeRaw = Number(value.time ?? value.timestamp);
            const time = timeRaw > 10_000_000_000 ? Math.floor(timeRaw / 1000) : Math.floor(timeRaw);
            const candle = { time, open: Number(value.open), high: Number(value.high), low: Number(value.low), close: Number(value.close), volume: Number(value.volume ?? 0) };
            return Object.values(candle).every(Number.isFinite) && candle.close > 0 ? [candle] : [];
          });
          if (parsed.length) setBaseCandles(parsed.sort((a, b) => a.time - b.time).slice(-3000));
        })
        .catch((cause: unknown) => {
          if ((cause as { name?: string })?.name !== "AbortError") setError(cause instanceof Error ? cause.message : "History unavailable");
        });
    }

    if (!MARKET_WS_URL) {
      setState("disabled");
      return () => controller.abort();
    }

    let socket: WebSocket | null = null;
    let retryTimer: number | undefined;
    let stopped = false;

    const connect = () => {
      setState(retryRef.current ? "reconnecting" : "connecting");
      socket = new WebSocket(MARKET_WS_URL);
      socket.addEventListener("open", () => {
        retryRef.current = 0;
        setState("live");
        setError("");
        socket?.send(JSON.stringify({ action: "subscribe", channel: "trades", market }));
      });
      socket.addEventListener("message", (event) => {
        try {
          const trade = parseTradeMessage(JSON.parse(String(event.data)), market);
          if (!trade) return;
          setTrades((current) => [trade, ...current].slice(0, 100));
          setBaseCandles((current) => addTradeToCandles(current, trade, 1));
        } catch {
          // Ignore heartbeat and non-trade messages.
        }
      });
      socket.addEventListener("error", () => setError("Live market feed connection failed"));
      socket.addEventListener("close", () => {
        if (stopped) return;
        retryRef.current += 1;
        setState("reconnecting");
        retryTimer = window.setTimeout(connect, Math.min(15_000, 750 * 2 ** Math.min(retryRef.current, 5)));
      });
    };

    connect();
    return () => {
      stopped = true;
      controller.abort();
      if (retryTimer) window.clearTimeout(retryTimer);
      if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ action: "unsubscribe", channel: "trades", market }));
      socket?.close();
    };
  }, [market]);


  useEffect(() => {
    if (!battleFrame || battleFrame.sequence === localSequenceRef.current || battleFrame.priceUsd <= 0) return;
    localSequenceRef.current = battleFrame.sequence;
    const priceChanged = localPriceRef.current === null || Math.abs(localPriceRef.current - battleFrame.priceUsd) > Math.max(1e-18, battleFrame.priceUsd * 1e-12);
    const shouldAppendTrade = priceChanged || battleFrame.executionVolumeUsd > 0;
    localPriceRef.current = battleFrame.priceUsd;
    if (!shouldAppendTrade) return;
    const trade: LiveTrade = {
      market,
      price: battleFrame.priceUsd,
      size: Math.max(0, battleFrame.executionVolumeUsd),
      timestamp: battleFrame.updatedAt,
    };
    setTrades((current) => [trade, ...current.filter((item) => item.timestamp !== trade.timestamp)].slice(0, 100));
    setBaseCandles((current) => addTradeToCandles(current, trade, 1));
  }, [battleFrame, market]);

  const candles = useMemo(() => timeframeSeconds === 1 ? baseCandles : aggregateCandles(baseCandles, timeframeSeconds), [baseCandles, timeframeSeconds]);
  const effectiveState: FeedState = battleFrame ? "live" : state;
  const source = battleFrame ? "battlepool" : MARKET_WS_URL ? "websocket" : "none";
  return { candles, trades, state: effectiveState, error, latestTrade: trades[0] ?? null, source, sequence: battleFrame?.sequence ?? 0 };
}
