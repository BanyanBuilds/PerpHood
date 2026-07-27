export type V52CompletionStatus = "complete" | "connected" | "prototype" | "missing";
export type V52CompletionArea = "product" | "execution" | "infrastructure" | "security" | "operations";

export type V52CompletionItem = {
  id: string;
  label: string;
  area: V52CompletionArea;
  status: V52CompletionStatus;
  summary: string;
  evidence: string[];
  nextAction: string;
  productionBlocker: boolean;
};

/**
 * Honest source-of-truth inventory for the current PERPHOOD build.
 * "Complete" means the current repository implements and guards the behavior;
 * it does not mean audited or approved for public funds.
 */
export const V52_COMPLETION_ITEMS: readonly V52CompletionItem[] = [
  {
    id: "terminal-shell",
    label: "Terminal-first workspace",
    area: "product",
    status: "complete",
    summary: "The root route is the full-screen terminal and page-level scrolling is avoided in favor of internal panel scrolling.",
    evidence: ["TerminalHub is the root experience", "Readable Padre-style density guards", "Saved workspace state"],
    nextAction: "Keep visual regressions covered while execution systems are consolidated.",
    productionBlocker: false,
  },
  {
    id: "markets-movers-presets",
    label: "Markets and Movers instant presets",
    area: "product",
    status: "complete",
    summary: "Quick Buy executes in place; Long and Short require independent enabled amount-and-leverage presets and never open a trading sidecar.",
    evidence: ["Six independent category presets", "Disabled unset Long/Short actions", "Duplicate-click protection"],
    nextAction: "Bind every production preset execution to the same scalable order gateway.",
    productionBlocker: false,
  },
  {
    id: "three-left-sidecars",
    label: "Three simultaneous left sidecars",
    area: "product",
    status: "complete",
    summary: "Markets and Movers can preserve three non-trading utility or research sidecars on the left with independent scrolling.",
    evidence: ["Three-slot left dock", "Saved-layout normalization", "Fourth panel safely floats"],
    nextAction: "Keep V53 cross-device persistence covered while identity and recovery are hardened.",
    productionBlocker: false,
  },
  {
    id: "cross-device-user-state",
    label: "Cross-device user settings",
    area: "product",
    status: "connected",
    summary: "V53 synchronizes presets, three-sidecar workspaces, watchlists, likes and alerts through a settings-only recovery identity with local fallback.",
    evidence: ["Section-level conflict merging", "Optimistic revisions", "256 KB payload ceiling", "No fund or trading authority"],
    nextAction: "Bind the settings profile to verified wallet identity without giving the sync key transaction authority.",
    productionBlocker: false,
  },
  {
    id: "selected-market-workspace",
    label: "Selected-market chart workspace",
    area: "product",
    status: "connected",
    summary: "Chart, positions, tape, risk lines and trading controls are integrated, but production chain data and execution are not connected.",
    evidence: ["1s/15s/30s candle support", "Executable-PNL display path", "Position and liquidation overlays"],
    nextAction: "Consolidate all live reads behind the production market-data gateway.",
    productionBlocker: true,
  },
  {
    id: "battlepool-math",
    label: "BattlePool settlement mathematics",
    area: "execution",
    status: "connected",
    summary: "Fixed-point settlement, liability reservation, short-floor payout, fee rounding and adversarial model tests exist, but compiled Solidity campaigns and independent audits remain required.",
    evidence: ["Exact-rational oracle", "No cross-position netting", "Stateful invariant model", "Stale-quote bounds"],
    nextAction: "Compile, run Foundry invariants and commission independent economic and contract review before funds.",
    productionBlocker: true,
  },
  {
    id: "launchpad",
    label: "Token launch lifecycle",
    area: "execution",
    status: "connected",
    summary: "The local factory creates one-billion-supply markets and applies the creator genesis-buy rule, but production deployment and migration settlement are unfinished.",
    evidence: ["Creator spend inclusive of gas", "No free creator allocation", "Creator perps restriction", "Local lifecycle console"],
    nextAction: "Finalize migration custody, deployment configuration and production event indexing.",
    productionBlocker: true,
  },
  {
    id: "account-ledger",
    label: "Internal account ledger",
    area: "execution",
    status: "connected",
    summary: "Deposits, withdrawals, token balances and custody liabilities are represented in the local router architecture.",
    evidence: ["ETH and token liability accounting", "Direct owner withdrawal", "Custody reconciliation checks"],
    nextAction: "Move custody to audited contracts and production-grade account projections.",
    productionBlocker: true,
  },
  {
    id: "session-authorization",
    label: "Authorize-once trading sessions",
    area: "security",
    status: "prototype",
    summary: "Bounded sessions, nonces, expiry and revocation exist, but P-256 authorization is still relay-verified instead of independently enforced on-chain.",
    evidence: ["Action bitmap", "Per-intent and cumulative limits", "Replay protection", "Owner revocation"],
    nextAction: "Implement and audit on-chain smart-account/session verification.",
    productionBlocker: true,
  },
  {
    id: "conditional-orders",
    label: "Limit, trigger, TP, SL and breakeven orders",
    area: "execution",
    status: "connected",
    summary: "Durable signed orders and keeper leases exist locally, including reduce-only protection and receipt reconciliation.",
    evidence: ["Atomic order persistence", "Exclusive keeper leases", "Bounded retries", "Breakeven state machine"],
    nextAction: "Move the order system to replicated SQL plus a durable event queue.",
    productionBlocker: true,
  },
  {
    id: "indexer-reconciliation",
    label: "Indexer, reconciliation and recovery",
    area: "infrastructure",
    status: "connected",
    summary: "Canonical event indexing, rollback/replay and reconciliation exist on a single-host SQLite reference implementation.",
    evidence: ["Common-ancestor rollback", "Deterministic projection replay", "Worker leases", "Recovery audit trail"],
    nextAction: "Add PostgreSQL, partitioned consumers, snapshots and multi-region recovery.",
    productionBlocker: true,
  },
  {
    id: "live-data-plane",
    label: "Realtime market-data plane",
    area: "infrastructure",
    status: "prototype",
    summary: "RPC quorum, durable SSE, candles and health alerts exist locally; production WebSocket fan-out and independent RPC fleets are not deployed.",
    evidence: ["1s/15s/30s OHLCV", "Provider divergence checks", "Sequence replay", "Optional Supabase replica"],
    nextAction: "Separate ingestion, event bus and horizontally scaled streaming gateways.",
    productionBlocker: true,
  },
  {
    id: "migration",
    label: "Post-launch migration",
    area: "execution",
    status: "prototype",
    summary: "Migration phases and gates are modeled, but asset movement, open-position treatment and destination liquidity are not finalized.",
    evidence: ["Begin/commit lifecycle state", "Open-position migration guard"],
    nextAction: "Finalize economics and implement atomic migration settlement.",
    productionBlocker: true,
  },
  {
    id: "mobile",
    label: "Dedicated mobile terminal",
    area: "product",
    status: "prototype",
    summary: "Responsive behavior exists, but the mobile experience is not yet a separately mastered trading workflow.",
    evidence: ["Responsive styles", "Mobile dock components"],
    nextAction: "Design and regression-test mobile as its own compact execution experience.",
    productionBlocker: false,
  },
  {
    id: "production-database",
    label: "Replicated production database",
    area: "infrastructure",
    status: "connected",
    summary: "V53 adds a Supabase/Postgres settings store with revision conflicts, device records and owner-scoped recovery, while production pooling, backups and trade projections remain unfinished.",
    evidence: ["V53 settings-only recovery identity", "Revision-safe JSONB snapshots", "Device audit trail", "Service-role-only API"],
    nextAction: "Deploy the V53 migration, add connection pooling, backups and partitioned high-volume projections.",
    productionBlocker: true,
  },
  {
    id: "scale-runtime",
    label: "100K–1M user runtime",
    area: "infrastructure",
    status: "missing",
    summary: "The repository has scale-aware concepts but no deployed queue, cache, partitioned sequencer fleet, streaming gateway fleet or measured load envelope.",
    evidence: ["V52 target topology and deterministic shard planner"],
    nextAction: "Implement service packages, queues, Redis-compatible coordination and repeatable load tests.",
    productionBlocker: true,
  },
  {
    id: "observability",
    label: "Production observability and incident response",
    area: "operations",
    status: "missing",
    summary: "Local dashboards exist, but centralized traces, metrics, logs, alerts, runbooks and on-call controls are not connected.",
    evidence: ["Local health consoles", "Worker heartbeat models"],
    nextAction: "Add structured telemetry, alert routing, SLOs and recovery runbooks.",
    productionBlocker: true,
  },
  {
    id: "security-audit",
    label: "Independent security approval",
    area: "security",
    status: "missing",
    summary: "Internal adversarial tests are extensive, but there is no independent smart-contract audit, economic audit or public-fund approval.",
    evidence: ["Portable assault suites", "Foundry campaigns packaged but not executed here"],
    nextAction: "Complete compiled campaigns, remediate findings and obtain independent audits.",
    productionBlocker: true,
  },
] as const;

export function summarizeV52Completion(items: readonly V52CompletionItem[] = V52_COMPLETION_ITEMS) {
  const byStatus: Record<V52CompletionStatus, number> = { complete: 0, connected: 0, prototype: 0, missing: 0 };
  const byArea: Record<V52CompletionArea, number> = { product: 0, execution: 0, infrastructure: 0, security: 0, operations: 0 };
  for (const item of items) {
    byStatus[item.status] += 1;
    byArea[item.area] += 1;
  }
  const blockers = items.filter((item) => item.productionBlocker && item.status !== "complete");
  const weighted = items.reduce((sum, item) => sum + ({ complete: 1, connected: 0.65, prototype: 0.3, missing: 0 }[item.status]), 0);
  return {
    total: items.length,
    byStatus,
    byArea,
    completionPercent: Math.round((weighted / Math.max(items.length, 1)) * 100),
    productionBlockers: blockers.length,
    productReadyForPublicFunds: blockers.length === 0,
  };
}
