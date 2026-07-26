"use client";

import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  Blocks,
  CheckCircle2,
  CircleDollarSign,
  Code2,
  Database,
  ExternalLink,
  FlaskConical,
  KeyRound,
  Play,
  RefreshCw,
  Rocket,
  Server,
  ShieldAlert,
  Wallet,
  XCircle,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Header } from "./Header";

type SandboxStatus = {
  ok: boolean;
  rpcConnected: boolean;
  rpcUrl: string;
  chainId: number | null;
  blockNumber: number | null;
  unlockedAccounts: number;
  factoryAddress: string | null;
  executableSpotCurve: boolean;
  fullPerpsSettlement: boolean;
  internalAccountLedger: boolean;
  sponsoredSessionExecution: boolean;
  demoState: null | {
    market: string;
    sequence: number;
    priceEth: number;
    marketCapEth: number;
    realWethEth: number;
    freeWethEth: number;
    curveSoldTokens: number;
    longOpenInterestEth: number;
    shortOpenInterestEth: number;
    activePositions: number;
    badDebtEth: number;
    maxSpotSellTokens: number;
    longCapacity5xEth: number;
    shortCapacityEth: number;
  };
  demoAccountState: null | {
    account: string;
    accountWethEth: number;
    accountTokenAmount: number;
    routerEthEth: number;
    routerTokenAmount: number;
    wethLiabilityEth: number;
    tokenLiabilityAmount: number;
    solvent: boolean;
  };
  manifest: null | {
    owner?: string;
    sequencer?: string;
    creator?: string;
    spotTrader?: string;
    factoryAddress?: string;
    accountRouterAddress?: string;
    factoryTransactionHash?: string;
    demoMarketAddress?: string;
    demoTokenAddress?: string;
    demoTransactionHash?: string;
    demoSpotBuyTransactionHash?: string;
    demoLongTransactionHash?: string;
    demoShortTransactionHash?: string;
    demoLongPositionId?: string;
    demoShortPositionId?: string;
    createdAt?: string;
  };
  error?: string;
  warning: string;
};

function shortAddress(value?: string | null) {
  if (!value) return "Not deployed";
  return `${value.slice(0, 9)}…${value.slice(-7)}`;
}

function formatAmount(value: number | undefined, maximumFractionDigits = 4) {
  if (value === undefined || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits }).format(value);
}

export function LaunchpadChainSandbox() {
  const [state, setState] = useState<SandboxStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("Start Anvil, deploy the V45 account router, then trade through the normal PERPHOOD terminal.");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/launchpad/sandbox", { cache: "no-store" });
      const payload = await response.json() as SandboxStatus;
      setState(payload);
      setNotice(payload.ok
        ? "Local chain, V45 account router, and deployment manifest are available. Authorized execution is ready."
        : payload.error ?? payload.warning);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not inspect the local sandbox.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const manifest = state?.manifest;
  const demoState = state?.demoState;
  const accountState = state?.demoAccountState;
  const factoryReady = Boolean(state?.rpcConnected && state.factoryAddress);

  return <><Header /><main className="v42-sandbox-page page-shell">
    <section className="v42-sandbox-hero">
      <div>
        <span className="eyebrow"><FlaskConical size={14} /> V45 AUTHORIZED ACCOUNT EXECUTION</span>
        <h1>Launch. Trade. Break it. Reset it.</h1>
        <p>V45 adds a fully backed internal account ledger and bounded authorize-once sessions above the unified BattlePool. Deposits, withdrawals, six trading actions, custody liabilities, and exact settlement remain visible in one local sandbox.</p>
      </div>
      <div>
        <Link href="/funding"><Wallet size={15} />Open Funding</Link>
        <Link href="/terminal?panel=launch"><Rocket size={15} />Open Launcher</Link>
        <Link href="/admin/launchpad"><Database size={15} />Lifecycle Console</Link>
        <Link href="/terminal" className="quiet"><ArrowLeft size={15} />Terminal</Link>
      </div>
    </section>

    <section className={`v42-sandbox-status ${state?.ok ? "online" : "offline"}`}>
      <span>{state?.ok ? <CheckCircle2 size={18} /> : <XCircle size={18} />}<strong>{state?.ok ? "V45 READY" : "BOOTSTRAP REQUIRED"}</strong><small>{state?.rpcUrl ?? "http://127.0.0.1:8545"}</small></span>
      <span><Blocks size={16} /><small>Chain</small><strong>{state?.chainId ?? "—"}</strong></span>
      <span><Activity size={16} /><small>Block</small><strong>{state?.blockNumber ?? "—"}</strong></span>
      <span><Wallet size={16} /><small>Unlocked accounts</small><strong>{state?.unlockedAccounts ?? "—"}</strong></span>
      <button type="button" onClick={() => void refresh()} disabled={loading} aria-label="Refresh sandbox status"><RefreshCw size={16} className={loading ? "spinning" : ""} /></button>
    </section>

    {demoState ? <section className="v43-chain-state" aria-label="Live V43 BattlePool state">
      <header><Activity size={17} /><span><strong>Live unified state</strong><small>Read directly from the V45 demo market</small></span><em>SEQ {demoState.sequence}</em></header>
      <div>
        <span><small>Market cap</small><b>{formatAmount(demoState.marketCapEth, 6)} ETH</b></span>
        <span><small>Marginal price</small><b>{formatAmount(demoState.priceEth, 12)} ETH</b></span>
        <span><small>Real pool WETH</small><b>{formatAmount(demoState.realWethEth, 6)} ETH</b></span>
        <span><small>Free WETH</small><b>{formatAmount(demoState.freeWethEth, 6)} ETH</b></span>
        <span><small>Long OI</small><b>{formatAmount(demoState.longOpenInterestEth, 6)} ETH</b></span>
        <span><small>Short OI</small><b>{formatAmount(demoState.shortOpenInterestEth, 6)} ETH</b></span>
        <span><small>5× long capacity</small><b>{formatAmount(demoState.longCapacity5xEth, 6)} ETH</b></span>
        <span><small>Short capacity</small><b>{formatAmount(demoState.shortCapacityEth, 6)} ETH</b></span>
        <span><small>Curve sold</small><b>{formatAmount(demoState.curveSoldTokens, 0)} tokens</b></span>
        <span><small>Max safe spot sell</small><b>{formatAmount(demoState.maxSpotSellTokens, 0)} tokens</b></span>
        <span><small>Open positions</small><b>{formatAmount(demoState.activePositions, 0)}</b></span>
        <span className={demoState.badDebtEth === 0 ? "healthy" : "danger"}><small>Bad debt</small><b>{formatAmount(demoState.badDebtEth, 8)} ETH</b></span>
      </div>
    </section> : null}

    {accountState ? <section className={`v45-account-state ${accountState.solvent ? "healthy" : "danger"}`} aria-label="Live V45 account custody state">
      <header><KeyRound size={17} /><span><strong>Live account custody state</strong><small>Router assets reconciled against user liabilities</small></span><em>{accountState.solvent ? "FULLY BACKED" : "ALERT"}</em></header>
      <div>
        <span><small>Demo account</small><b>{shortAddress(accountState.account)}</b></span>
        <span><small>Account ETH</small><b>{formatAmount(accountState.accountWethEth, 6)} ETH</b></span>
        <span><small>Account tokens</small><b>{formatAmount(accountState.accountTokenAmount, 0)}</b></span>
        <span><small>Router ETH</small><b>{formatAmount(accountState.routerEthEth, 6)} ETH</b></span>
        <span><small>ETH liabilities</small><b>{formatAmount(accountState.wethLiabilityEth, 6)} ETH</b></span>
        <span><small>Router tokens</small><b>{formatAmount(accountState.routerTokenAmount, 0)}</b></span>
        <span><small>Token liabilities</small><b>{formatAmount(accountState.tokenLiabilityAmount, 0)}</b></span>
        <span><small>Solvency</small><b>{accountState.solvent ? "PASS" : "FAIL"}</b></span>
      </div>
    </section> : null}

    <section className="v42-sandbox-grid">
      <article className="v42-sandbox-card primary">
        <header><Server size={18} /><span><strong>Deployment spine</strong><small>Authoritative local addresses</small></span><em>{factoryReady ? "READY" : "WAITING"}</em></header>
        <div className="v42-address-ledger">
          <span><small>Factory</small><b>{shortAddress(state?.factoryAddress)}</b></span>
          <span><small>Account router</small><b>{shortAddress(manifest?.accountRouterAddress ?? state?.factoryAddress)}</b></span>
          <span><small>Owner</small><b>{shortAddress(manifest?.owner)}</b></span>
          <span><small>Sequencer</small><b>{shortAddress(manifest?.sequencer)}</b></span>
          <span><small>Demo account</small><b>{shortAddress(manifest?.spotTrader)}</b></span>
          <span><small>Demo market</small><b>{shortAddress(manifest?.demoMarketAddress)}</b></span>
          <span><small>Demo token</small><b>{shortAddress(manifest?.demoTokenAddress)}</b></span>
          <span><small>Demo long</small><b>{manifest?.demoLongPositionId ? `Position #${manifest.demoLongPositionId}` : "—"}</b></span>
          <span><small>Demo short</small><b>{manifest?.demoShortPositionId ? `Position #${manifest.demoShortPositionId}` : "—"}</b></span>
          <span><small>Deployed</small><b>{manifest?.createdAt ? new Date(manifest.createdAt).toLocaleString() : "—"}</b></span>
        </div>
        <footer><Code2 size={15} /><span>Compiled with Foundry and deployed through unlocked Anvil accounts. No private keys are written into the PERPHOOD project.</span></footer>
      </article>

      <article className="v42-sandbox-card">
        <header><Play size={18} /><span><strong>One-command bootstrap</strong><small>From the project root</small></span></header>
        <div className="v42-command-list">
          <code><b>1</b> npm run chain:anvil</code>
          <code><b>2</b> npm run chain:v45</code>
          <code><b>3</b> add the printed V45 addresses to .env.local</code>
          <code><b>4</b> npm run dev</code>
        </div>
        <p>The deploy command compiles V45, deploys the factory/account router, launches HOOD, seeds risk reserves, funds three internal accounts, then executes a real spot buy, long, and short before writing the deployment manifest.</p>
      </article>

      <article className="v42-sandbox-card">
        <header><Zap size={18} /><span><strong>Executable now</strong><small>Real local transactions</small></span></header>
        <ul>
          <li><CheckCircle2 size={14} />Fully backed ETH and per-market token ledgers</li>
          <li><CheckCircle2 size={14} />Owner-only deposits and direct withdrawals</li>
          <li><CheckCircle2 size={14} />Bounded eight-hour authorize-once sessions</li>
          <li><CheckCircle2 size={14} />Nonce, deadline, action, market, and replay enforcement</li>
          <li><CheckCircle2 size={14} />Sponsored Spot Buy, Spot Sell, Long, Short, and Close</li>
          <li><CheckCircle2 size={14} />Direct wallet fallback without an active session</li>
          <li><CheckCircle2 size={14} />Shared spot/perps reserve settlement</li>
          <li><CheckCircle2 size={14} />Close-only and paused emergency modes</li>
        </ul>
      </article>

      <article className="v42-sandbox-card warning">
        <header><ShieldAlert size={18} /><span><strong>Still intentionally local-only</strong><small>Do not confuse this with production</small></span></header>
        <ul>
          <li><AlertTriangle size={14} />Native ETH still replaces canonical Robinhood Chain WETH</li>
          <li><AlertTriangle size={14} />The local sequencer verifies P-256 intents off-chain and remains trusted within session caps</li>
          <li><AlertTriangle size={14} />No production indexer, condition-order keeper, redundant liquidator, or recovery coordinator</li>
          <li><AlertTriangle size={14} />No Solidity compilation result, security audit, or Robinhood Chain public deployment in this package</li>
        </ul>
      </article>
    </section>

    <section className="v42-sandbox-flow">
      <article><span>01</span><ArrowDownToLineIcon /><strong>Deposit</strong><small>The owner deposits ETH into a router whose assets must remain greater than or equal to recorded liabilities.</small></article>
      <i />
      <article><span>02</span><KeyRound size={18} /><strong>Authorize</strong><small>A bounded session defines permitted actions, expiry, per-intent limit, cumulative limit, and the next valid nonce.</small></article>
      <i />
      <article><span>03</span><CircleDollarSign size={18} /><strong>Trade</strong><small>The sequencer sponsors approved intents while the same BattlePool settles spot, longs, shorts, closes, and liquidations.</small></article>
      <i />
      <article><span>04</span><ExternalLink size={18} /><strong>Exit</strong><small>The owner can revoke the session, close positions directly, and withdraw through a path the sequencer cannot call.</small></article>
    </section>

    <section className="v42-sandbox-notice" aria-live="polite"><AlertTriangle size={16} /><span><strong>{factoryReady ? "V45 local account mode available" : "V45 local account mode unavailable"}</strong><small>{notice}</small></span></section>
  </main></>;
}

function ArrowDownToLineIcon() {
  return <Wallet size={18} />;
}
