import {
  DEFAULT_LOCAL_RPC,
  readLocalBattleState,
  type LocalBattleState,
} from "./local-battle-client.ts";

type Listener = () => void;

export type LocalBattleStoreSnapshot = {
  enabled: boolean;
  connected: boolean;
  state: LocalBattleState | null;
  error: string | null;
  pollIntervalMs: number;
  lastAttemptAt: number;
};

class LocalBattleStore {
  private snapshot: LocalBattleStoreSnapshot = {
    enabled: process.env.NEXT_PUBLIC_BATTLE_SOURCE === "chain",
    connected: false,
    state: null,
    error: null,
    pollIntervalMs: Number(process.env.NEXT_PUBLIC_LOCAL_CHAIN_POLL_MS ?? 120),
    lastAttemptAt: 0,
  };
  private listeners = new Set<Listener>();
  private readonly serverSnapshot: LocalBattleStoreSnapshot = { ...this.snapshot, connected: false, state: null };
  private timer: ReturnType<typeof setTimeout> | null = null;
  private subscribers = 0;
  private stopped = true;

  subscribe = (listener: Listener) => {
    this.listeners.add(listener);
    this.subscribers += 1;
    if (this.subscribers === 1) this.start();
    return () => {
      this.listeners.delete(listener);
      this.subscribers = Math.max(0, this.subscribers - 1);
      if (!this.subscribers) this.stop();
    };
  };

  getSnapshot = () => this.snapshot;

  getServerSnapshot = () => this.serverSnapshot;

  refresh = async () => {
    await this.poll();
  };

  private emit() {
    this.listeners.forEach((listener) => listener());
  }

  private start() {
    if (!this.snapshot.enabled || !this.stopped) return;
    this.stopped = false;
    void this.poll();
  }

  private stop() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private schedule() {
    if (this.stopped || !this.subscribers) return;
    this.timer = setTimeout(() => void this.poll(), Math.max(50, this.snapshot.pollIntervalMs));
  }

  private async poll() {
    if (!this.snapshot.enabled) return;
    const rpcUrl = process.env.NEXT_PUBLIC_LOCAL_CHAIN_RPC ?? DEFAULT_LOCAL_RPC;
    const contract = process.env.NEXT_PUBLIC_LOCAL_BATTLE_POOL_ADDRESS;
    this.snapshot = { ...this.snapshot, lastAttemptAt: Date.now() };
    try {
      const state = await readLocalBattleState(rpcUrl, contract);
      this.snapshot = { ...this.snapshot, connected: true, state, error: null };
    } catch (error) {
      this.snapshot = {
        ...this.snapshot,
        connected: false,
        error: error instanceof Error ? error.message : "Local chain unavailable.",
      };
    }
    this.emit();
    this.schedule();
  }
}

export const localBattleStore = new LocalBattleStore();
