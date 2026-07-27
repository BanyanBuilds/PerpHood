"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type RenderFpsMode = "auto" | 60 | 120 | 144 | 240 | 360;
export type RenderQuality = "balanced" | "high" | "ultra";
export type TerminalFrameListener = (frame: { now: number; deltaMs: number; sequence: number }) => void;

const FPS_STEPS = [60, 120, 144, 240, 360] as const;
const STORAGE_KEY = "perphood-v25-render-fps";

type TerminalPerformanceContextValue = {
  mode: RenderFpsMode;
  setMode: (mode: RenderFpsMode) => void;
  requestedFps: number;
  effectiveFps: number;
  displayFps: number;
  measuredFps: number;
  displayHz: number;
  quality: RenderQuality;
  frameBudgetMs: number;
  interpolationMs: number;
  autoAdjusted: boolean;
  manualOverdrive: boolean;
  hardwareLabel: string;
  subscribeFrame: (listener: TerminalFrameListener) => () => void;
};

const TerminalPerformanceContext = createContext<TerminalPerformanceContextValue | null>(null);

function closestDisplayStep(value: number) {
  if (!Number.isFinite(value) || value <= 0) return 60;
  const known = [60, 75, 90, 100, 120, 144, 165, 180, 200, 240, 300, 360, 480];
  return known.reduce((best, candidate) => Math.abs(candidate - value) < Math.abs(best - value) ? candidate : best, 60);
}

function capabilityCap() {
  if (typeof navigator === "undefined") return 60;
  const cores = navigator.hardwareConcurrency || 4;
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4;
  if (cores >= 12 && memory >= 8) return 360;
  if (cores >= 8 && memory >= 8) return 240;
  if (cores >= 6 && memory >= 4) return 144;
  if (cores >= 4) return 120;
  return 60;
}

function autoTarget(displayHz: number, cap: number) {
  const ceiling = Math.min(displayHz, cap);
  return [...FPS_STEPS].reverse().find((value) => value <= ceiling + 3) ?? 60;
}

function qualityFor(fps: number): RenderQuality {
  if (fps >= 240) return "ultra";
  if (fps >= 120) return "high";
  return "balanced";
}

export function TerminalPerformanceProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<RenderFpsMode>("auto");
  const [measuredFps, setMeasuredFps] = useState(60);
  const [displayHz, setDisplayHz] = useState(60);
  const [cap, setCap] = useState(60);
  const [adaptiveCap, setAdaptiveCap] = useState(60);
  const maximumObservedFps = useRef(60);
  const recoveryWindows = useRef(0);
  const frameListeners = useRef(new Set<TerminalFrameListener>());

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === "auto" || FPS_STEPS.includes(Number(saved) as (typeof FPS_STEPS)[number])) {
      setModeState(saved === "auto" ? "auto" : Number(saved) as RenderFpsMode);
    }
    const deviceCap = capabilityCap();
    setCap(deviceCap);
    setAdaptiveCap(deviceCap);
  }, []);

  useEffect(() => {
    let animationFrame = 0;
    let windowStarted = performance.now();
    let frames = 0;
    const intervals: number[] = [];
    let previous = windowStarted;

    const sample = (now: number) => {
      const delta = now - previous;
      previous = now;
      if (delta > 0 && delta < 100) intervals.push(delta);
      frames += 1;

      const elapsed = now - windowStarted;
      if (elapsed >= 1_000) {
        const current = frames * 1_000 / elapsed;
        const sorted = intervals.slice().sort((a, b) => a - b);
        const fastInterval = sorted[Math.max(0, Math.floor(sorted.length * 0.2))] ?? 16.67;
        const observedCeiling = Math.min(480, 1_000 / Math.max(2, fastInterval));
        maximumObservedFps.current = Math.max(maximumObservedFps.current, observedCeiling);
        if (document.visibilityState === "visible") {
          const observedDisplay = closestDisplayStep(maximumObservedFps.current);
          setMeasuredFps(Number(current.toFixed(1)));
          setDisplayHz(observedDisplay);
          if (mode === "auto") {
            setAdaptiveCap((currentCap) => {
              const target = autoTarget(observedDisplay, Math.min(cap, currentCap));
              if (current < target * 0.82) {
                recoveryWindows.current = 0;
                return [...FPS_STEPS].reverse().find((step) => step < target) ?? 60;
              }
              if (current >= target * 0.96 && target < Math.min(observedDisplay, cap)) {
                recoveryWindows.current += 1;
                if (recoveryWindows.current >= 4) {
                  recoveryWindows.current = 0;
                  return FPS_STEPS.find((step) => step > target && step <= Math.min(observedDisplay, cap)) ?? currentCap;
                }
              } else {
                recoveryWindows.current = 0;
              }
              return currentCap;
            });
          }
        }
        frames = 0;
        intervals.length = 0;
        windowStarted = now;
      }
      animationFrame = window.requestAnimationFrame(sample);
    };

    animationFrame = window.requestAnimationFrame(sample);
    return () => window.cancelAnimationFrame(animationFrame);
  }, [cap, mode]);

  const setMode = useCallback((next: RenderFpsMode) => {
    setModeState(next);
    window.localStorage.setItem(STORAGE_KEY, String(next));
  }, []);

  const subscribeFrame = useCallback((listener: TerminalFrameListener) => {
    frameListeners.current.add(listener);
    return () => frameListeners.current.delete(listener);
  }, []);

  const requestedFps = mode === "auto" ? autoTarget(displayHz, Math.min(cap, adaptiveCap)) : mode;
  // Auto respects the detected monitor and device tier. A manual target is intentionally
  // uncapped: it drives Leverage X's chart/PNL interpolation loop at the requested rate even
  // when the monitor can physically present fewer frames.
  const effectiveFps = Math.max(30, mode === "auto" ? Math.min(requestedFps, displayHz, cap) : requestedFps);
  const displayFps = Math.max(30, Math.min(effectiveFps, displayHz));
  const manualOverdrive = mode !== "auto" && effectiveFps > displayHz;
  const quality = qualityFor(effectiveFps);
  const autoAdjusted = mode === "auto" && effectiveFps < Math.min(displayHz, cap);
  const frameBudgetMs = 1_000 / effectiveFps;
  const interpolationMs = effectiveFps >= 240 ? 72 : effectiveFps >= 120 ? 92 : 125;
  const hardwareLabel = `${displayHz} Hz display · ${cap} FPS auto tier`;

  useEffect(() => {
    let cancelled = false;
    let timer = 0;
    let sequence = 0;
    let previous = performance.now();
    let nextDeadline = previous;
    const budget = 1_000 / effectiveFps;

    const tick = () => {
      if (cancelled) return;
      const now = performance.now();
      const deltaMs = now - previous;
      previous = now;
      sequence += 1;
      frameListeners.current.forEach((listener) => listener({ now, deltaMs, sequence }));
      nextDeadline += budget;
      if (nextDeadline < now - budget * 2) nextDeadline = now + budget;
      timer = window.setTimeout(tick, Math.max(0, nextDeadline - performance.now()));
    };

    timer = window.setTimeout(tick, budget);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [effectiveFps]);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.renderFps = String(effectiveFps);
    root.dataset.displayFps = String(displayFps);
    root.dataset.renderQuality = quality;
    root.dataset.manualOverdrive = manualOverdrive ? "true" : "false";
    root.style.setProperty("--terminal-frame-budget", `${frameBudgetMs.toFixed(3)}ms`);
    root.style.setProperty("--terminal-interpolation-ms", `${interpolationMs}ms`);
  }, [displayFps, effectiveFps, frameBudgetMs, interpolationMs, manualOverdrive, quality]);

  const value = useMemo<TerminalPerformanceContextValue>(() => ({
    mode,
    setMode,
    requestedFps,
    effectiveFps,
    displayFps,
    measuredFps,
    displayHz,
    quality,
    frameBudgetMs,
    interpolationMs,
    autoAdjusted,
    manualOverdrive,
    hardwareLabel,
    subscribeFrame,
  }), [autoAdjusted, displayFps, displayHz, effectiveFps, frameBudgetMs, hardwareLabel, interpolationMs, manualOverdrive, measuredFps, mode, quality, requestedFps, setMode, subscribeFrame]);

  return <TerminalPerformanceContext.Provider value={value}>{children}</TerminalPerformanceContext.Provider>;
}

export function useTerminalPerformance() {
  const context = useContext(TerminalPerformanceContext);
  if (!context) throw new Error("useTerminalPerformance must be used inside TerminalPerformanceProvider");
  return context;
}
