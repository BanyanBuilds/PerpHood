import type { Token } from "@/lib/types";
import { analyzeMarket } from "@/lib/market-intelligence";

export function MarketIntelBadge({ token, compact = false }: { token: Token; compact?: boolean }) {
  const intel = analyzeMarket(token);
  return <div className={`market-intel-badge state-${intel.state.toLowerCase()} ${compact ? "compact" : ""}`} title={`Discovery ${intel.discovery.toFixed(0)} · Momentum ${intel.momentum.toFixed(0)} · Risk ${intel.grade} · Perp ${intel.perp.toFixed(0)}`}>
    <strong>{intel.state}</strong><span>{intel.composite.toFixed(0)}</span><em>{intel.grade}</em>
  </div>;
}
