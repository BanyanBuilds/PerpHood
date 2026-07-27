"use client";

import {
  AreaSeries,
  CandlestickSeries,
  HistogramSeries,
  PriceScaleMode,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import {
  BarChart3,
  Camera,
  Check,
  Crosshair,
  Eye,
  Layers3,
  Maximize2,
  Minus,
  RotateCcw,
  Ruler,
  Settings2,
  SlidersHorizontal,
  Type,
  UsersRound,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useLiveMarket } from "@/hooks/useLiveMarket";
import type { Token } from "@/lib/types";
import { useMarkets } from "./MarketProvider";
import { useOutsideDismiss } from "./useOutsideDismiss";

const TIMEFRAMES = [
  { label: "1s", seconds: 1 },
  { label: "15s", seconds: 15 },
  { label: "30s", seconds: 30 },
  { label: "1m", seconds: 60 },
  { label: "5m", seconds: 300 },
  { label: "15m", seconds: 900 },
  { label: "1h", seconds: 3_600 },
  { label: "4h", seconds: 14_400 },
  { label: "1d", seconds: 86_400 },
] as const;

const PRIMARY_TIMEFRAMES = TIMEFRAMES.slice(0, 5);
const MORE_TIMEFRAMES = TIMEFRAMES.slice(5);

type CandleSeries = ISeriesApi<"Candlestick">;
type Area = ISeriesApi<"Area">;
type TimeframeLabel = (typeof TIMEFRAMES)[number]["label"];
type ChartMode = "candles" | "simple";
type DisplayMode = "price" | "marketcap";

type ChartPreferences = {
  mode: ChartMode;
  displayMode: DisplayMode;
  range: TimeframeLabel;
  showVolume: boolean;
  showGrid: boolean;
  showOhlc: boolean;
  showWatermark: boolean;
  logarithmic: boolean;
  showTrades: boolean;
  showDev: boolean;
  showSmart: boolean;
  showSnipers: boolean;
  showLiquidationClusters: boolean;
  showMarkerLegend: boolean;
  showEntry: boolean;
  showLiquidationLine: boolean;
  showTpSl: boolean;
  showOrders: boolean;
};

const DEFAULT_PREFERENCES: ChartPreferences = {
  mode: "candles",
  displayMode: "marketcap",
  range: "1s",
  showVolume: true,
  showGrid: true,
  showOhlc: true,
  showWatermark: false,
  logarithmic: false,
  showTrades: false,
  showDev: true,
  showSmart: false,
  showSnipers: false,
  showLiquidationClusters: true,
  showMarkerLegend: false,
  showEntry: true,
  showLiquidationLine: true,
  showTpSl: true,
  showOrders: true,
};

const STORAGE_KEY = "perphood-v37-chart-preferences";

function compact(value: number | undefined) {
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(value ?? 0);
}

function price(value: number | undefined) {
  if (!Number.isFinite(value) || !value) return "—";
  if ((value ?? 0) < 0.0001) return value?.toPrecision(6) ?? "—";
  return value?.toLocaleString(undefined, { maximumFractionDigits: 8 }) ?? "—";
}

function SettingToggle({ label, detail, enabled, onChange }: {
  label: string;
  detail?: string;
  enabled: boolean;
  onChange: () => void;
}) {
  return <button type="button" className={`v37-chart-setting-toggle ${enabled ? "enabled" : ""}`} onClick={onChange}>
    <span><strong>{label}</strong>{detail && <small>{detail}</small>}</span>
    <i aria-hidden="true">{enabled && <Check size={12} />}</i>
  </button>;
}

export type MarketChartLiveSnapshot = { price: number; marketCap: number; sequence: number; updatedAt: number };

export function MarketChart({ token, onLiveSnapshot }: { token: Token; onLiveSnapshot?: (snapshot: MarketChartLiveSnapshot) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const fullscreenRef = useRef<HTMLElement>(null);
  const settingsRootRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<CandleSeries | null>(null);
  const areaRef = useRef<Area | null>(null);
  const volumeRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const hasFit = useRef(false);
  const [preferences, setPreferences] = useState<ChartPreferences>(DEFAULT_PREFERENCES);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const timeframe = TIMEFRAMES.find((item) => item.label === preferences.range) ?? TIMEFRAMES[0];
  const { candles, state, error, latestTrade, source, sequence } = useLiveMarket(token.slug, timeframe.seconds);
  const { positions, pendingOrders } = useMarkets();
  const position = positions.find((item) => item.slug === token.slug);
  const tokenOrders = pendingOrders.filter((item) => item.slug === token.slug);

  useOutsideDismiss([settingsRootRef], () => setSettingsOpen(false), settingsOpen);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as Partial<ChartPreferences>;
        const validRange = TIMEFRAMES.some((item) => item.label === parsed.range) ? parsed.range : DEFAULT_PREFERENCES.range;
        setPreferences({ ...DEFAULT_PREFERENCES, ...parsed, range: validRange as TimeframeLabel });
      }
    } catch {
      // Invalid saved chart preferences fall back to the clean default.
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  }, [hydrated, preferences]);

  const updatePreference = <K extends keyof ChartPreferences>(key: K, value: ChartPreferences[K]) => {
    setPreferences((current) => ({ ...current, [key]: value }));
  };

  useEffect(() => {
    if (!ref.current) return;
    ref.current.innerHTML = "";
    hasFit.current = false;
    const chart = createChart(ref.current, {
      autoSize: true,
      layout: {
        background: { color: "transparent" },
        textColor: "#8d9690",
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        fontSize: 12,
      },
      grid: {
        vertLines: { visible: preferences.showGrid, color: "rgba(148,170,157,.055)" },
        horzLines: { visible: preferences.showGrid, color: "rgba(148,170,157,.07)" },
      },
      rightPriceScale: {
        borderVisible: false,
        mode: preferences.logarithmic ? PriceScaleMode.Logarithmic : PriceScaleMode.Normal,
        scaleMargins: { top: 0.08, bottom: preferences.showVolume ? 0.24 : 0.08 },
        entireTextOnly: true,
      },
      timeScale: {
        borderVisible: false,
        timeVisible: true,
        secondsVisible: timeframe.seconds < 60,
        rightOffset: 7,
        barSpacing: timeframe.seconds <= 30 ? 9 : 6,
        minBarSpacing: 2,
        fixLeftEdge: false,
      },
      crosshair: {
        mode: 0,
        vertLine: { color: "rgba(174,255,196,.40)", labelBackgroundColor: "#173d24" },
        horzLine: { color: "rgba(174,255,196,.40)", labelBackgroundColor: "#173d24" },
      },
      handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true },
      handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
      kineticScroll: { touch: true, mouse: true },
    });
    chartRef.current = chart;

    const priceFormat = preferences.displayMode === "marketcap"
      ? { type: "custom" as const, minMove: 1, formatter: (value: number) => `$${compact(value)}` }
      : { type: "custom" as const, minMove: 0.0000000001, formatter: (value: number) => price(value) };
    if (preferences.mode === "simple") {
      areaRef.current = chart.addSeries(AreaSeries, {
        lineColor: "#74e39a",
        topColor: "rgba(62,206,111,.24)",
        bottomColor: "rgba(25,54,34,0)",
        lineWidth: 3,
        priceLineVisible: true,
        lastValueVisible: true,
        crosshairMarkerRadius: 4,
        priceFormat,
      });
    } else {
      candleRef.current = chart.addSeries(CandlestickSeries, {
        upColor: "#54df87",
        downColor: "#ff6f68",
        wickUpColor: "#54df87",
        wickDownColor: "#ff6f68",
        borderVisible: false,
        priceLineVisible: true,
        lastValueVisible: true,
        priceFormat,
      });
    }
    const volumeSeries = chart.addSeries(HistogramSeries, {
      visible: preferences.showVolume,
      priceFormat: { type: "volume" },
      priceScaleId: "volume",
      lastValueVisible: false,
      priceLineVisible: false,
    });
    volumeRef.current = volumeSeries;
    volumeSeries.priceScale().applyOptions({ scaleMargins: { top: 0.84, bottom: 0 } });

    return () => {
      candleRef.current = null;
      areaRef.current = null;
      volumeRef.current = null;
      chart.remove();
    };
  }, [preferences.displayMode, preferences.logarithmic, preferences.mode, preferences.showGrid, preferences.showVolume, timeframe.seconds]);

  useEffect(() => {
    const multiplier = preferences.displayMode === "marketcap" && token.price > 0 ? token.cap / token.price : 1;
    const candleData = candles.map((item) => ({
      time: item.time as UTCTimestamp,
      open: item.open * multiplier,
      high: item.high * multiplier,
      low: item.low * multiplier,
      close: item.close * multiplier,
      volume: item.volume,
    }));
    candleRef.current?.setData(candleData);
    areaRef.current?.setData(candleData.map((item) => ({ time: item.time, value: item.close })));
    volumeRef.current?.setData(candleData.map((item) => ({
      time: item.time,
      value: item.volume,
      color: item.close >= item.open ? "rgba(84,223,135,.32)" : "rgba(255,111,104,.29)",
    })));
    if (candles.length && !hasFit.current) {
      chartRef.current?.timeScale().fitContent();
      hasFit.current = true;
    }
  }, [candles, preferences.displayMode, token.cap, token.price]);

  useEffect(() => {
    const series = candleRef.current ?? areaRef.current;
    if (!series || !token.price || !token.cap) return;
    const unit = preferences.displayMode === "marketcap" ? 1 : token.price / token.cap;
    const lines: Array<ReturnType<typeof series.createPriceLine>> = [];
    if (position && preferences.showEntry) {
      lines.push(series.createPriceLine({ price: position.entryCap * unit, color: "rgba(104,166,255,.86)", lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: `ENTRY ${position.leverage}×` }));
    }
    if (position && preferences.showLiquidationLine) {
      lines.push(series.createPriceLine({ price: position.liquidationCap * unit, color: "rgba(255,111,104,.90)", lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: "LIQ" }));
    }
    if (position && preferences.showTpSl) {
      if (position.takeProfitCap) lines.push(series.createPriceLine({ price: position.takeProfitCap * unit, color: "rgba(84,223,135,.86)", lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: "TP" }));
      if (position.stopLossCap) lines.push(series.createPriceLine({ price: position.stopLossCap * unit, color: "rgba(245,157,91,.86)", lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: "SL" }));
    }
    if (preferences.showOrders) {
      tokenOrders.slice(0, 6).forEach((order) => lines.push(series.createPriceLine({
        price: order.triggerCap * unit,
        color: order.side === "short" ? "rgba(255,111,104,.82)" : "rgba(190,154,255,.84)",
        lineWidth: 1,
        lineStyle: 3,
        axisLabelVisible: true,
        title: order.kind.toUpperCase(),
      })));
    }
    return () => lines.forEach((line) => series.removePriceLine(line));
  }, [position, preferences.displayMode, preferences.showEntry, preferences.showLiquidationLine, preferences.showOrders, preferences.showTpSl, token.cap, token.price, tokenOrders]);

  const capture = () => {
    const canvas = chartRef.current?.takeScreenshot();
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = `${token.symbol.toLowerCase()}-${preferences.range}-chart.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  };

  const latest = candles.at(-1);
  const waiting = candles.length === 0;
  const displayMultiplier = preferences.displayMode === "marketcap" && token.price > 0 ? token.cap / token.price : 1;
  const displayedLatest = latest ? {
    open: latest.open * displayMultiplier,
    high: latest.high * displayMultiplier,
    low: latest.low * displayMultiplier,
    close: latest.close * displayMultiplier,
    volume: latest.volume,
  } : undefined;
  const formatDisplay = (value: number | undefined) => preferences.displayMode === "marketcap" ? `$${compact(value)}` : price(value);
  const feedLabel = source === "battlepool" ? `BATTLEPOOL LIVE #${sequence}` : state === "live" ? "LIVE" : state === "disabled" ? "FEED NOT CONFIGURED" : state.toUpperCase();
  const moreRange = MORE_TIMEFRAMES.some((item) => item.label === preferences.range) ? preferences.range : "";

  useEffect(() => {
    const livePrice = latestTrade?.price ?? latest?.close ?? token.price;
    if (!livePrice || !Number.isFinite(livePrice)) return;
    const marketCap = token.price > 0 ? livePrice * (token.cap / token.price) : token.cap;
    onLiveSnapshot?.({ price: livePrice, marketCap, sequence, updatedAt: latestTrade?.timestamp ?? Date.now() });
  }, [latest?.close, latestTrade?.price, latestTrade?.timestamp, onLiveSnapshot, sequence, token.cap, token.price]);

  return (
    <section ref={fullscreenRef} className="terminal-chart-shell glass-panel live-chart-v16 v37-gmgn-chart">
      <div className="terminal-chart-toolbar v37-chart-toolbar">
        <div className="chart-timeframes v37-primary-timeframes">
          {PRIMARY_TIMEFRAMES.map((value) => <button type="button" key={value.label} className={preferences.range === value.label ? "active" : ""} onClick={() => updatePreference("range", value.label)}>{value.label}</button>)}
          <select aria-label="More chart intervals" value={moreRange} onChange={(event) => event.target.value && updatePreference("range", event.target.value as TimeframeLabel)}>
            <option value="">More</option>
            {MORE_TIMEFRAMES.map((value) => <option value={value.label} key={value.label}>{value.label}</option>)}
          </select>
        </div>
        <span className="chart-toolbar-separator" />
        <button type="button" className={preferences.mode === "candles" ? "active" : ""} onClick={() => updatePreference("mode", preferences.mode === "candles" ? "simple" : "candles")} title="Toggle candles or line"><BarChart3 size={14} /><span>{preferences.mode === "candles" ? "Candles" : "Line"}</span></button>
        <button type="button" onClick={() => setSettingsOpen(true)}><SlidersHorizontal size={14} /><span>Indicators</span></button>
        <span className="chart-display-switch"><button type="button" className={preferences.displayMode === "marketcap" ? "active" : ""} onClick={() => updatePreference("displayMode", "marketcap")}>MC</button><button type="button" className={preferences.displayMode === "price" ? "active" : ""} onClick={() => updatePreference("displayMode", "price")}>Price</button></span>
        <span className="chart-toolbar-spacer" />
        <button type="button" onClick={capture} aria-label="Save chart screenshot" title="Save screenshot"><Camera size={14} /></button>
        <button type="button" onClick={() => fullscreenRef.current?.requestFullscreen?.()} aria-label="Open chart fullscreen" title="Fullscreen"><Maximize2 size={14} /></button>
        <div ref={settingsRootRef} className="v37-chart-settings-root">
          <button type="button" className={settingsOpen ? "active" : ""} onClick={() => setSettingsOpen((value) => !value)} aria-label="Chart settings"><Settings2 size={14} /></button>
          {settingsOpen && <div className="v37-chart-settings-popover">
            <header><span><strong>Chart settings</strong><small>Saved for this browser</small></span><div><button type="button" onClick={() => setPreferences(DEFAULT_PREFERENCES)} title="Reset chart settings"><RotateCcw size={14} /></button><button type="button" onClick={() => setSettingsOpen(false)} aria-label="Close chart settings"><X size={15} /></button></div></header>
            <section><h3><Eye size={14} />Display</h3><div className="v37-chart-settings-grid">
              <SettingToggle label="Volume" detail="Bottom histogram" enabled={preferences.showVolume} onChange={() => updatePreference("showVolume", !preferences.showVolume)} />
              <SettingToggle label="Grid" detail="Chart gridlines" enabled={preferences.showGrid} onChange={() => updatePreference("showGrid", !preferences.showGrid)} />
              <SettingToggle label="OHLC" detail="Live candle values" enabled={preferences.showOhlc} onChange={() => updatePreference("showOhlc", !preferences.showOhlc)} />
              <SettingToggle label="Watermark" detail="Ticker and mode" enabled={preferences.showWatermark} onChange={() => updatePreference("showWatermark", !preferences.showWatermark)} />
              <SettingToggle label="Log scale" detail="Large market moves" enabled={preferences.logarithmic} onChange={() => updatePreference("logarithmic", !preferences.logarithmic)} />
              <SettingToggle label="Buy / sell prints" detail="Recent executions" enabled={preferences.showTrades} onChange={() => updatePreference("showTrades", !preferences.showTrades)} />
            </div></section>
            <section><h3><Layers3 size={14} />My trading layers</h3><div className="v37-chart-settings-grid">
              <SettingToggle label="Entry line" enabled={preferences.showEntry} onChange={() => updatePreference("showEntry", !preferences.showEntry)} />
              <SettingToggle label="Liquidation line" enabled={preferences.showLiquidationLine} onChange={() => updatePreference("showLiquidationLine", !preferences.showLiquidationLine)} />
              <SettingToggle label="TP / SL" enabled={preferences.showTpSl} onChange={() => updatePreference("showTpSl", !preferences.showTpSl)} />
              <SettingToggle label="Pending orders" enabled={preferences.showOrders} onChange={() => updatePreference("showOrders", !preferences.showOrders)} />
              <SettingToggle label="Liquidation clusters" detail="Public leverage pressure" enabled={preferences.showLiquidationClusters} onChange={() => updatePreference("showLiquidationClusters", !preferences.showLiquidationClusters)} />
            </div></section>
            <section><h3><UsersRound size={14} />Wallet intelligence</h3><div className="v37-chart-settings-grid">
              <SettingToggle label="Developer" detail="Creator activity" enabled={preferences.showDev} onChange={() => updatePreference("showDev", !preferences.showDev)} />
              <SettingToggle label="Smart / KOL" detail="Tracked wallets" enabled={preferences.showSmart} onChange={() => updatePreference("showSmart", !preferences.showSmart)} />
              <SettingToggle label="Snipers / insiders" detail="Early wallet flow" enabled={preferences.showSnipers} onChange={() => updatePreference("showSnipers", !preferences.showSnipers)} />
              <SettingToggle label="Marker legend" enabled={preferences.showMarkerLegend} onChange={() => updatePreference("showMarkerLegend", !preferences.showMarkerLegend)} />
            </div></section>
          </div>}
        </div>
      </div>
      <div className="terminal-chart-body">
        <div className="chart-drawing-tools" aria-label="Chart drawing tools"><button type="button" className="active"><Crosshair size={16} /></button><button type="button"><Minus size={16} /></button><button type="button"><Ruler size={16} /></button><button type="button"><Type size={16} /></button></div>
        <div className="terminal-chart-content">
          {preferences.showOhlc && <div className="terminal-ohlc">
            <span>O <b>{formatDisplay(displayedLatest?.open)}</b></span><span>H <b>{formatDisplay(displayedLatest?.high)}</b></span><span>L <b>{formatDisplay(displayedLatest?.low)}</b></span><span>C <b className={(displayedLatest?.close ?? 0) >= (displayedLatest?.open ?? 0) ? "positive" : "negative"}>{formatDisplay(displayedLatest?.close)}</b></span><span>VOL <b>{compact(displayedLatest?.volume)}</b></span>
          </div>}
          <div ref={ref} className="terminal-chart-canvas" />
          {preferences.showWatermark && <div className="terminal-chart-watermark"><b>{token.symbol}</b><span>LEVERAGE X · {preferences.range} · {preferences.displayMode === "marketcap" ? "MARKET CAP" : "TOKEN PRICE"}</span></div>}
          {preferences.showLiquidationClusters && <div className="v37-liquidation-clusters" aria-label="Public liquidation clusters"><span className="short" style={{ top: "24%" }}><b>12 shorts</b><small>+7.8% MC</small></span><span className="long" style={{ top: "71%" }}><b>8 longs</b><small>−9.4% MC</small></span></div>}
          {(preferences.showDev || preferences.showSmart || preferences.showSnipers || preferences.showLiquidationClusters) && <div className="chart-wallet-markers" aria-label="Wallet intelligence markers">
            {preferences.showDev && <span className="wallet-mark dev" style={{ left: "18%", top: "63%" }}><b>D</b><em>DEV BUY</em></span>}
            {preferences.showSmart && <span className="wallet-mark smart" style={{ left: "39%", top: "38%" }}><b>K</b><em>KOL / SMART</em></span>}
            {preferences.showSnipers && <span className="wallet-mark sniper" style={{ left: "62%", top: "57%" }}><b>N</b><em>SNIPER</em></span>}
            {preferences.showLiquidationClusters && <span className="wallet-mark liquidation" style={{ left: "79%", top: "28%" }}><b>💀</b><em>3 SHORT LIQS</em></span>}
          </div>}
          {preferences.showTrades && <div className="v37-trade-markers" aria-label="Recent buy and sell executions"><span className="buy" style={{ left: "29%", top: "67%" }}>B</span><span className="sell" style={{ left: "53%", top: "35%" }}>S</span><span className="buy" style={{ left: "72%", top: "55%" }}>B</span></div>}
          {preferences.showMarkerLegend && <div className="chart-wallet-legend">{preferences.showDev && <span className="dev">DEV</span>}{preferences.showSmart && <span className="smart">KOL</span>}{preferences.showSnipers && <span className="sniper">SNIPER</span>}{preferences.showLiquidationClusters && <span className="liq">LIQUIDATION</span>}</div>}
          <div className={`chart-live-badge ${state === "live" ? "is-live" : ""}`}><i />{feedLabel} · {preferences.range.toUpperCase()}</div>
          {waiting && <div className="chart-empty-live"><span className="chart-empty-pulse" /><strong>{state === "disabled" ? "Connect the market data feed" : "Waiting for the first BattlePool execution"}</strong><p>{error || "No candles are fabricated. The chart renders BattlePool state frames and verified external trade events."}</p></div>}
          {!waiting && latestTrade && <div className="chart-last-trade"><small>LAST TRADE</small><strong>{formatDisplay(latestTrade.price * displayMultiplier)}</strong><span>{compact(latestTrade.size)} {token.symbol}</span></div>}
        </div>
      </div>
    </section>
  );
}
