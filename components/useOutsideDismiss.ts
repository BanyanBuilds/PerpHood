"use client";

import { useEffect, type RefObject } from "react";

type DismissEvent = MouseEvent | TouchEvent;

type OutsideDismissRef = Pick<RefObject<HTMLElement | null>, "current">;

export function useOutsideDismiss(
  refs: readonly OutsideDismissRef[],
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
