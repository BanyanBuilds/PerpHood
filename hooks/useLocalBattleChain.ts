"use client";

import { useSyncExternalStore } from "react";
import { localBattleStore } from "@/lib/chain/local-battle-store";

export function useLocalBattleChain() {
  return useSyncExternalStore(
    localBattleStore.subscribe,
    localBattleStore.getSnapshot,
    localBattleStore.getServerSnapshot,
  );
}
