"use client";

import Link from "next/link";
import { Activity, Gauge, KeyRound, RadioTower, Zap } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useBattleRealtime } from "@/hooks/useBattleRealtime";
import { useLocalBattleChain } from "@/hooks/useLocalBattleChain";
import type { Token } from "@/lib/types";
import { loadSessionKey } from "@/lib/chain/session-key";

function signedEth(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(5)} ETH`;
}

export function RealtimeSpeedStrip({ token }: { token: Token }) {
  const frame = useBattleRealtime(token.slug);
  const chain = useLocalBattleChain();
  const [now, setNow] = useState(Date.now());
  const [sessionKeyReady, setSessionKeyReady] = useState(false);

  useEffect(() => {
    setSessionKeyReady(Boolean(loadSessionKey()));
    const timer = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(timer);
  }, []);

  const totalPnl = useMemo(() => Object.values(frame?.positionPnl ?? {}).reduce((sum, quote) => sum + quote.pnlEth, 0), [frame]);
  const quoteCount = Object.keys(frame?.positionPnl ?? {}).length;
  const chainAuthoritative = Boolean(chain.enabled && chain.connected && chain.state);
  const authoritativeUpdatedAt = chainAuthoritative ? chain.state!.receivedAt : frame?.updatedAt;
  const authoritativeSequence = chainAuthoritative ? chain.state!.sequence : frame?.sequence;
  const ageMs = authoritativeUpdatedAt ? Math.max(0, now - authoritativeUpdatedAt) : 0;
  const fresh = Boolean(authoritativeUpdatedAt && ageMs < 500);

  return <section className={`realtime-speed-strip glass-panel ${fresh ? "is-fresh" : ""}`} aria-label="Realtime BattlePool speed status">
    <span><Zap size={14} /><small>State stream</small><strong>{authoritativeSequence !== undefined ? `#${authoritativeSequence}` : "Starting"}</strong></span>
    <span><Gauge size={14} /><small>Frame age</small><strong>{authoritativeUpdatedAt ? `${ageMs} ms` : "—"}</strong></span>
    <span><Activity size={14} /><small>Executable live P&amp;L</small><strong className={totalPnl >= 0 ? "positive" : "negative"}>{quoteCount ? signedEth(totalPnl) : "No open perps"}</strong></span>
    <span><RadioTower size={14} /><small>Authority</small><strong>{chainAuthoritative ? "Chain custody" : frame?.source === "chain" ? "Chain" : frame?.source === "sequencer" ? "Sequencer" : "BattlePool local"}</strong></span>
    <span><KeyRound size={14} /><small>Fast signer</small><strong>{sessionKeyReady ? "P-256 ready" : "Not armed"}</strong></span>
    <em><i />{chainAuthoritative ? "Chain-ordered custody frame; executable P&L remains sequencer-computed from the same committed state." : "Chart, liquidation health, and P&L share one ordered state frame."}<Link href="/admin/session-keys">Session execution →</Link></em>
  </section>;
}
