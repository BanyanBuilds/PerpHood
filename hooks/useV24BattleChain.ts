"use client";

import { useSyncExternalStore } from "react";
import { v24BattleStore } from "@/lib/chain/v24-battle-store";

export function useV24BattleChain() {
  return useSyncExternalStore(v24BattleStore.subscribe, v24BattleStore.getSnapshot, v24BattleStore.getServerSnapshot);
}
