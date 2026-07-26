"use client";

import Link from "next/link";
import {
  Activity,
  ArrowLeft,
  Blocks,
  CircleDollarSign,
  DatabaseZap,
  ExternalLink,
  Gauge,
  KeyRound,
  HardDriveDownload,
  RadioTower,
  RefreshCw,
  ShieldCheck,
  WalletCards,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Header } from "@/components/Header";
import { KeyButton } from "@/components/KeyButton";
import { useLocalBattleChain } from "@/hooks/useLocalBattleChain";
import {
  DEFAULT_LOCAL_RPC,
  connectLocalWallet,
  depositLocalWeth,
  formatWad,
  readLocalAccountBalance,
  waitForReceipt,
  withdrawLocalToken,
  withdrawLocalWeth,
  type LocalAccountBalance,
} from "@/lib/chain/local-battle-client";
import { toWad } from "@/lib/chain/abi";

const ACTION_LABELS = [
  "Genesis",
  "Spot buy",
  "Spot sell",
  "Open long",
  "Close long",
  "Open short",
  "Close short",
  "Long liquidation",
  "Short liquidation",
  "Deposit",
  "Withdraw",
];

function shortHash(value?: string | null) {
  if (!value) return "—";
  return `${value.slice(0, 10)}…${value.slice(-8)}`;
}

export default function LocalChainPage() {
  const chain = useLocalBattleChain();
  const [account, setAccount] = useState<string | null>(null);
  const [balance, setBalance] = useState<LocalAccountBalance | null>(null);
  const [amount, setAmount] = useState("0.1");
  const [busy, setBusy] = useState<"connect" | "deposit" | "withdraw-weth" | "withdraw-token" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const contractAddress = process.env.NEXT_PUBLIC_LOCAL_BATTLE_POOL_ADDRESS;
  const rpcUrl = process.env.NEXT_PUBLIC_LOCAL_CHAIN_RPC ?? DEFAULT_LOCAL_RPC;

  const refreshBalance = useCallback(async () => {
    if (!account || !contractAddress) return;
    try {
      setBalance(await readLocalAccountBalance(account, rpcUrl, contractAddress));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not read account balance.");
    }
  }, [account, contractAddress, rpcUrl]);

  useEffect(() => {
    void refreshBalance();
  }, [chain.state?.sequence, refreshBalance]);

  const send = async (kind: Exclude<typeof busy, "connect" | null>) => {
    if (!account || !contractAddress) return;
    setBusy(kind);
    setNotice(null);
    try {
      const amountWad = toWad(amount);
      const transactionHash = kind === "deposit"
        ? await depositLocalWeth(account, amountWad, contractAddress)
        : kind === "withdraw-weth"
          ? await withdrawLocalWeth(account, amountWad, contractAddress)
          : await withdrawLocalToken(account, amountWad, contractAddress);
      await waitForReceipt(transactionHash, rpcUrl);
      await refreshBalance();
      setNotice(`${kind === "deposit" ? "Deposit" : "Withdrawal"} finalized: ${shortHash(transactionHash)}`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Local-chain transaction failed.");
    } finally {
      setBusy(null);
    }
  };

  const connect = async () => {
    setBusy("connect");
    setNotice(null);
    try {
      const connected = await connectLocalWallet();
      setAccount(connected);
      setBalance(await readLocalAccountBalance(connected, rpcUrl, contractAddress));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Wallet connection failed.");
    } finally {
      setBusy(null);
    }
  };

  const state = chain.state;
  const frameAge = state ? Math.max(0, Date.now() - state.receivedAt) : null;
  const chainPrice = state ? Number(state.marginalPriceWad) / 1e18 : 0;
  const custodyClaims = state ? state.poolWethWad + (balance?.wethWad ?? 0n) : 0n;
  const status = useMemo(() => {
    if (!chain.enabled) return { label: "Local chain disabled", tone: "warning" };
    if (!contractAddress) return { label: "Contract address missing", tone: "warning" };
    if (chain.connected && state?.custodySolvent) return { label: "Chain authoritative", tone: "positive" };
    if (chain.connected) return { label: "Custody invariant failed", tone: "negative" };
    return { label: "Waiting for Anvil", tone: "warning" };
  }, [chain.connected, chain.enabled, contractAddress, state?.custodySolvent]);

  return <><Header /><main className="local-chain-page page-shell">
    <section className="local-chain-hero glass-panel">
      <div>
        <span className="eyebrow">V22 LOCAL-CHAIN CUSTODY</span>
        <h1>One pool. Real custody. Ordered frames.</h1>
        <p>The deterministic BattlePool sequencer remains the fast execution brain. V22 adds scoped session-key authority above this real EVM custody and settlement spine: actual ETH, the complete one-billion-token supply, balanced deltas, instant internal payouts, and withdrawable user balances.</p>
      </div>
      <div className="local-chain-hero-actions">
        <Link href="/admin/session-keys"><KeyButton compact><KeyRound size={15} />Session Keys</KeyButton></Link><Link href="/admin/risk-lab"><KeyButton compact><Gauge size={15} />Risk Lab</KeyButton></Link>
        <Link href="/terminal"><KeyButton compact tone="dark"><ArrowLeft size={15} />Terminal</KeyButton></Link>
      </div>
    </section>

    <section className={`local-chain-status glass-panel ${status.tone}`}>
      <span><i /><strong>{status.label}</strong><small>{chain.error ?? `${rpcUrl} · chain 31337`}</small></span>
      <span><RadioTower size={17} /><small>Poll target</small><strong>{chain.pollIntervalMs} ms</strong></span>
      <span><Zap size={17} /><small>RPC latency</small><strong>{state ? `${state.rpcLatencyMs.toFixed(1)} ms` : "—"}</strong></span>
      <span><Activity size={17} /><small>Frame age</small><strong>{frameAge === null ? "—" : `${frameAge} ms`}</strong></span>
      <button onClick={() => window.location.reload()} aria-label="Refresh local-chain state"><RefreshCw size={16} /></button>
    </section>

    <section className="local-chain-kpis">
      <ChainKpi icon={Blocks} label="Ordered sequence" value={state ? `#${state.sequence}` : "—"} note={`Block ${state?.blockNumber ?? "—"}`} />
      <ChainKpi icon={CircleDollarSign} label="Pool ETH" value={state ? `${formatWad(state.poolWethWad)} ETH` : "—"} note={`${state ? formatWad(state.availablePoolWethWad) : "—"} ETH immediately free`} />
      <ChainKpi icon={DatabaseZap} label="Pool token inventory" value={state ? Number(state.poolTokenAmount / 1_000_000_000_000_000_000n).toLocaleString() : "—"} note="Physical tokens remain in contract custody" />
      <ChainKpi icon={ShieldCheck} label="Custody invariant" value={state ? (state.custodySolvent ? "PASS" : "FAIL") : "—"} note="Physical assets cover pool + user claims" tone={state?.custodySolvent ? "positive" : state ? "negative" : undefined} />
    </section>

    <section className="local-chain-grid">
      <article className="local-chain-ledger glass-panel">
        <header><span><HardDriveDownload size={18} /><strong>Authoritative BattlePool frame</strong></span><b>{state ? ACTION_LABELS[state.action] ?? `Action ${state.action}` : "Offline"}</b></header>
        <LedgerRow label="State hash" value={shortHash(state?.stateHash)} mono />
        <LedgerRow label="Market ID" value={shortHash(state?.marketId)} mono />
        <LedgerRow label="Marginal price" value={state ? `${chainPrice.toExponential(6)} ETH` : "—"} />
        <LedgerRow label="Market cap" value={state ? `${formatWad(state.marketCapWad)} ETH` : "—"} />
        <LedgerRow label="Reserved instant payouts" value={state ? `${formatWad(state.reservedWethWad)} ETH` : "—"} />
        <LedgerRow label="Long open interest" value={state ? `${formatWad(state.openInterestLongWad)} ETH` : "—"} />
        <LedgerRow label="Short open interest" value={state ? `${formatWad(state.openInterestShortWad)} ETH` : "—"} />
        <LedgerRow label="Positions root" value={shortHash(state?.positionsRoot)} mono />
        <footer><span>Received by browser</span><strong>{state ? new Date(state.receivedAt).toLocaleTimeString() : "—"}</strong></footer>
      </article>

      <article className="local-wallet-card glass-panel">
        <header><span><WalletCards size={18} /><strong>Local funded wallet</strong></span><b>{account ? shortHash(account) : "Not connected"}</b></header>
        {!account ? <div className="local-wallet-empty"><p>Connect MetaMask to Anvil chain 31337. Import one of Anvil’s displayed test keys to use a funded local wallet.</p><KeyButton onClick={connect} disabled={busy === "connect"}>{busy === "connect" ? "Connecting…" : "Connect local wallet"}</KeyButton></div> : <>
          <div className="local-wallet-balances">
            <span><small>Internal ETH</small><strong>{balance ? `${formatWad(balance.wethWad)} ETH` : "Reading…"}</strong></span>
            <span><small>Internal tokens</small><strong>{balance ? Number(balance.tokenAmount / 1_000_000_000_000_000_000n).toLocaleString() : "Reading…"}</strong></span>
          </div>
          <label className="local-chain-amount"><span>Amount</span><input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" /><b>18 decimals</b></label>
          <div className="local-wallet-actions">
            <KeyButton compact onClick={() => void send("deposit")} disabled={Boolean(busy)}>{busy === "deposit" ? "Depositing…" : "Deposit ETH"}</KeyButton>
            <KeyButton compact tone="dark" onClick={() => void send("withdraw-weth")} disabled={Boolean(busy)}>{busy === "withdraw-weth" ? "Withdrawing…" : "Withdraw ETH"}</KeyButton>
            <KeyButton compact tone="red" onClick={() => void send("withdraw-token")} disabled={Boolean(busy)}>{busy === "withdraw-token" ? "Withdrawing…" : "Withdraw tokens"}</KeyButton>
          </div>
          <small className="local-custody-footnote">Visible claims in this panel: {formatWad(custodyClaims)} ETH. Contract-wide custody is enforced independently.</small>
        </>}
        {notice && <p className="local-chain-notice">{notice}</p>}
      </article>
    </section>

    <section className="local-chain-flow glass-panel">
      <div><span>1</span><strong>Intent accepted</strong><small>Wallet authorizes a scoped V22 session key once; subsequent trades avoid wallet popups.</small></div>
      <i />
      <div><span>2</span><strong>Sequencer computes</strong><small>Price, liquidations, chart and executable PNL share one deterministic frame.</small></div>
      <i />
      <div><span>3</span><strong>Contract conserves</strong><small>Every user credit is matched by an equal pool debit—or the frame reverts.</small></div>
      <i />
      <div><span>4</span><strong>User withdraws</strong><small>Internal payout becomes physical ETH or tokens without waiting for another trader.</small></div>
    </section>

    <section className="local-chain-warning glass-panel"><ShieldCheck size={21} /><span><strong>Local prototype—not audited custody</strong><small>V22 intentionally separates fast deterministic execution from conservative chain settlement. Pricing and liquidations are still sequencer-authored, while the contract independently enforces order, replay protection, conservation, reserves, and physical custody.</small></span><ExternalLink size={18} /></section>
  </main></>;
}

function ChainKpi({ icon: Icon, label, value, note, tone }: { icon: typeof Blocks; label: string; value: string; note: string; tone?: "positive" | "negative" }) {
  return <article className="local-chain-kpi glass-panel"><Icon size={19} /><small>{label}</small><strong className={tone}>{value}</strong><span>{note}</span></article>;
}

function LedgerRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return <div><span>{label}</span><strong className={mono ? "mono" : ""}>{value}</strong></div>;
}
