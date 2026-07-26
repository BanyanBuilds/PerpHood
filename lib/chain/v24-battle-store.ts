import { DEFAULT_LOCAL_RPC } from "./local-battle-client.ts";
import { readV24BattleState, readV24LiquidationContinuation, type V24ChainState, type V24LiquidationContinuation } from "./v24-battle-client.ts";

type Listener = () => void;
export type V24BattleStoreSnapshot = {
  enabled: boolean;
  connected: boolean;
  state: V24ChainState | null;
  continuation: V24LiquidationContinuation | null;
  error: string | null;
  pollIntervalMs: number;
};

class V24BattleStore {
  private snapshot: V24BattleStoreSnapshot = {
    enabled: Boolean(process.env.NEXT_PUBLIC_V24_BATTLE_POOL_ADDRESS),
    connected: false,
    state: null,
    continuation: null,
    error: null,
    pollIntervalMs: Number(process.env.NEXT_PUBLIC_LOCAL_CHAIN_POLL_MS ?? 120),
  };
  private readonly serverSnapshot = { ...this.snapshot, state: null, continuation: null, connected: false };
  private listeners = new Set<Listener>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private subscribers = 0;

  subscribe = (listener: Listener) => {
    this.listeners.add(listener);
    this.subscribers += 1;
    if (this.subscribers === 1) void this.poll();
    return () => {
      this.listeners.delete(listener);
      this.subscribers = Math.max(0, this.subscribers - 1);
      if (!this.subscribers && this.timer) clearTimeout(this.timer);
    };
  };
  getSnapshot = () => this.snapshot;
  getServerSnapshot = () => this.serverSnapshot;

  private emit() { this.listeners.forEach((listener) => listener()); }
  private schedule() {
    if (!this.subscribers || !this.snapshot.enabled) return;
    this.timer = setTimeout(() => void this.poll(), Math.max(50, this.snapshot.pollIntervalMs));
  }
  private async poll() {
    if (!this.snapshot.enabled) return;
    const rpcUrl = process.env.NEXT_PUBLIC_LOCAL_CHAIN_RPC ?? DEFAULT_LOCAL_RPC;
    const contract = process.env.NEXT_PUBLIC_V24_BATTLE_POOL_ADDRESS;
    try {
      const [state, continuation] = await Promise.all([
        readV24BattleState(rpcUrl, contract),
        readV24LiquidationContinuation(rpcUrl, contract),
      ]);
      this.snapshot = { ...this.snapshot, connected: true, state, continuation, error: null };
    } catch (error) {
      this.snapshot = { ...this.snapshot, connected: false, error: error instanceof Error ? error.message : "V24 local chain unavailable." };
    }
    this.emit();
    this.schedule();
  }
}

export const v24BattleStore = new V24BattleStore();
