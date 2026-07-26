"use client";

import { useEffect, type RefObject } from "react";

type DismissEvent = MouseEvent | TouchEvent;

export function useOutsideDismiss<T extends HTMLElement>(
  refs: Array<RefObject<T | null>>,
  onDismiss: () => void,
  enabled = true,
) {
  useEffect(() => {
    if (!enabled) return;

    const handlePointer = (event: DismissEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (refs.some((ref) => ref.current?.contains(target))) return;
      onDismiss();
    };

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onDismiss();
    };

    document.addEventListener("mousedown", handlePointer, true);
    document.addEventListener("touchstart", handlePointer, true);
    window.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handlePointer, true);
      document.removeEventListener("touchstart", handlePointer, true);
      window.removeEventListener("keydown", handleKey);
    };
  }, [enabled, onDismiss, refs]);
}
