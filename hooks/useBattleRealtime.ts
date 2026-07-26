"use client";

import { useCallback, useSyncExternalStore } from "react";
import { battleRealtimeStore } from "@/lib/realtime-battle";

export function useBattleRealtime(slug: string) {
  const subscribe = useCallback((listener: () => void) => battleRealtimeStore.subscribe(slug, listener), [slug]);
  const getSnapshot = useCallback(() => battleRealtimeStore.getSnapshot(slug), [slug]);
  const getServerSnapshot = useCallback(() => null, []);
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
