"use client";

import { useEffect, useRef, useState } from "react";
import { useTerminalPerformance } from "@/components/TerminalPerformanceProvider";

export function useAnimatedNumber(value: number) {
  const { effectiveFps, interpolationMs } = useTerminalPerformance();
  const [displayed, setDisplayed] = useState(value);
  const displayedRef = useRef(value);

  useEffect(() => {
    const start = displayedRef.current;
    if (!Number.isFinite(value) || Math.abs(value - start) < 1e-12) {
      displayedRef.current = value;
      setDisplayed(value);
      return;
    }

    const startedAt = performance.now();
    const frameInterval = 1_000 / effectiveFps;
    let previousPaint = 0;
    let animationFrame = 0;

    const animate = (now: number) => {
      if (now - previousPaint >= frameInterval - 0.25) {
        previousPaint = now;
        const progress = Math.min(1, (now - startedAt) / interpolationMs);
        const eased = 1 - Math.pow(1 - progress, 3);
        const next = start + (value - start) * eased;
        displayedRef.current = next;
        setDisplayed(next);
        if (progress >= 1) return;
      }
      animationFrame = window.requestAnimationFrame(animate);
    };

    animationFrame = window.requestAnimationFrame(animate);
    return () => window.cancelAnimationFrame(animationFrame);
  }, [effectiveFps, interpolationMs, value]);

  return displayed;
}
