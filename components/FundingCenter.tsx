"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine, Check, Clipboard, Copy, Database, KeyRound, Power, QrCode, RefreshCw, ShieldCheck, WalletCards, Zap } from "lucide-react";
import { fromWad, toWad, type Hex } from "@/lib/chain/abi";
import { connectLocalWallet, injectedProvider } from "@/lib/chain/local-battle-client";
import {
  authorizeV45Session,
  configuredV45RouterAddress,
  depositV45Account,
  readV45AccountState,
  readV45SessionState,
  revokeV45Session,
  withdrawV45Account,
  type V45AccountState,
  type V45SessionState,
} from "@/lib/chain/v45-account-client";
import {
  bindV45SessionKey,
  clearV45SessionKey,
  createV45SessionKeyMaterial,
  loadV45Account,
  loadV45SessionKey,
  saveV45Account,
  saveV45SessionKey,
  V45_ALL_TRADING_ACTION_BITMAP,
  type V45BoundSessionKey,
} from "@/lib/chain/v45-session-key";
import { readV47IndexedAccount, type V47IndexedAccountSnapshot } from "@/lib/chain/v47-indexed-client";
import { useMarkets } from "./MarketProvider";

type HistoryItem = { id: string; type: "deposit" | "withdrawal" | "session"; amount?: number; status: "Confirmed" | "Pending" | "Revoked"; time: string; hash?: string };

const SESSION_HOURS = 8;
const MAX_INTENT_ETH = 0.5;
const MAX_CUMULATIVE_ETH = 5;

function shortAddress(value?: string | null) {
  return value ? `${value.slice(0, 8)}…${value.slice(-6)}` : "Not connected";
}

export function FundingCenter() {
  const { balanceEth, syncTradingAccountBalance } = useMarkets();
  const [tab, setTab] = useState<"deposit" | "withdraw">("deposit");
  const [amount, setAmount] = useState("0.10");
  const [account, setAccount] = useState<Hex | null>(() => loadV45Account());
  const [accountState, setAccountState] = useState<V45AccountState | null>(null);
  const [sessionKey, setSessionKey] = useState<V45BoundSessionKey | null>(null);
  const [sessionState, setSessionState] = useState<V45SessionState | null>(null);
  const [copied, setCopied] = useState(false);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [indexed, setIndexed] = useState<V47IndexedAccountSnapshot | null>(null);

  const router = configuredV45RouterAddress();
  const market = (process.env.NEXT_PUBLIC_V45_DEMO_MARKET_ADDRESS ?? process.env.NEXT_PUBLIC_V43_DEMO_MARKET_ADDRESS ?? "") as Hex;
  const configured = Boolean(router && /^0x[0-9a-fA-F]{40}$/.test(market));
  const parsedAmount = Number(amount) || 0;
  const indexedBalanceWei = indexed?.account?.weth_balance_wei ? BigInt(indexed.account.weth_balance_wei) : null;
  const authoritativeBalance = accountState ? fromWad(accountState.accountWethWei, 8) : indexedBalanceWei !== null ? fromWad(indexedBalanceWei, 8) : balanceEth;
  const availableUsd = authoritativeBalance * 3200;
  const indexedSession = indexed?.sessions.find((session) => Boolean(session.active) && session.valid_until * 1000 > Date.now()) ?? null;
  const sessionActive = Boolean((sessionState?.active && sessionState.validUntil * 1000 > Date.now()) || indexedSession);
  const accountHealth = accountState ? accountState.solvent ? "Fully backed" : "Reconciliation alert" : configured ? "Connect wallet" : "Local simulation";

  const refresh = useCallback(async (nextAccount = account, nextSession = sessionKey) => {
    if (!configured || !nextAccount || !router) return;
    const [nextAccountState, indexedSnapshot] = await Promise.all([
      readV45AccountState(nextAccount, market, router),
      readV47IndexedAccount(nextAccount, market).catch(() => null),
    ]);
    setAccountState(nextAccountState);
    if (indexedSnapshot) setIndexed(indexedSnapshot);
    syncTradingAccountBalance(fromWad(nextAccountState.accountWethWei, 8));
    if (nextSession) {
      const nextSessionState = await readV45SessionState(nextSession.sessionId, router);
      setSessionState(nextSessionState);
    } else {
      setSessionState(null);
    }
  }, [account, configured, market, router, sessionKey, syncTradingAccountBalance]);

  useEffect(() => {
    const material = loadV45SessionKey();
    const savedAccount = loadV45Account();
    if (material && savedAccount) setSessionKey(bindV45SessionKey(material, savedAccount));
  }, []);

  useEffect(() => {
    void refresh().catch(() => undefined);
    if (!configured || !account) return;
    const interval = window.setInterval(() => { void refresh().catch(() => undefined); }, 3_000);
    return () => window.clearInterval(interval);
  }, [account, configured, refresh]);

  const connect = useCallback(async () => {
    const provider = injectedProvider();
    if (!provider) throw new Error("Install or unlock an EVM wallet, then connect to the local LEVERAGE X chain.");
    const next = saveV45Account(await connectLocalWallet(provider));
    setAccount(next);
    const material = loadV45SessionKey();
    const bound = material ? bindV45SessionKey(material, next) : null;
    setSessionKey(bound);
    await refresh(next, bound);
    return next;
  }, [refresh]);

  function copyAddress() {
    if (!router) return;
    navigator.clipboard?.writeText(router);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setNotice("");
    try { await action(); }
    catch (error) { setNotice(error instanceof Error ? error.message : "V45 account action failed."); }
    finally { setBusy(false); }
  }

  function submitDeposit() {
    void run(async () => {
      if (!configured) throw new Error("Deploy V45 with npm run chain:v45 and add the printed addresses to .env.local.");
      if (parsedAmount <= 0) throw new Error("Enter an amount greater than zero.");
      const receipt = await depositV45Account(toWad(parsedAmount));
      const nextAccount = saveV45Account(receipt.account);
      setAccount(nextAccount);
      await refresh(nextAccount, sessionKey);
      setHistory((items) => [{ id: crypto.randomUUID(), type: "deposit", amount: parsedAmount, status: "Confirmed", time: "Just now", hash: receipt.transactionHash }, ...items]);
      setNotice(`${parsedAmount.toFixed(4)} ETH is confirmed in the fully backed V45 account ledger.`);
    });
  }

  function submitWithdrawal() {
    void run(async () => {
      if (!configured) throw new Error("The V45 account router is not configured.");
      if (parsedAmount <= 0) throw new Error("Enter an amount greater than zero.");
      if (parsedAmount > authoritativeBalance) throw new Error("Withdrawal exceeds your reconciled account balance.");
      const receipt = await withdrawV45Account(toWad(parsedAmount));
      const nextAccount = saveV45Account(receipt.account);
      setAccount(nextAccount);
      await refresh(nextAccount, sessionKey);
      setHistory((items) => [{ id: crypto.randomUUID(), type: "withdrawal", amount: parsedAmount, status: "Confirmed", time: "Just now", hash: receipt.transactionHash }, ...items]);
      setNotice(`Withdrawal confirmed directly to ${shortAddress(nextAccount)}.`);
    });
  }

  function createSession() {
    void run(async () => {
      if (!configured || !router) throw new Error("The V45 account router is not configured.");
      const owner = account ?? await connect();
      const material = await createV45SessionKeyMaterial();
      const bound = bindV45SessionKey(material, owner);
      const validUntil = Math.floor(Date.now() / 1000) + SESSION_HOURS * 60 * 60;
      const result = await authorizeV45Session({
        sessionId: bound.sessionId,
        publicKeyHash: bound.publicKeyHash,
        validUntil,
        maxNotionalWei: toWad(MAX_INTENT_ETH),
        maxCumulativeNotionalWei: toWad(MAX_CUMULATIVE_ETH),
        actionBitmap: V45_ALL_TRADING_ACTION_BITMAP,
        router,
      });
      saveV45SessionKey(material);
      saveV45Account(result.account);
      setAccount(result.account);
      setSessionKey(bound);
      await refresh(result.account, bound);
      setHistory((items) => [{ id: crypto.randomUUID(), type: "session", status: "Confirmed", time: "Just now", hash: result.transactionHash }, ...items]);
      setNotice(`Instant execution authorized for ${SESSION_HOURS} hours with a ${MAX_INTENT_ETH.toFixed(2)} ETH per-intent cap and ${MAX_CUMULATIVE_ETH.toFixed(2)} ETH cumulative cap.`);
    });
  }

  function revokeSession() {
    void run(async () => {
      const sessionId = sessionKey?.sessionId ?? indexedSession?.session_id;
      if (!sessionId || !router) throw new Error("No active V45/V47 session is available to revoke.");
      const result = await revokeV45Session(sessionId as Hex, router);
      clearV45SessionKey();
      setSessionKey(null);
      setSessionState(null);
      setHistory((items) => [{ id: crypto.randomUUID(), type: "session", status: "Revoked", time: "Just now", hash: result.transactionHash }, ...items]);
      setIndexed((current) => current ? { ...current, sessions: current.sessions.map((session) => session.session_id.toLowerCase() === sessionId.toLowerCase() ? { ...session, active: 0 } : session) } : current);
      setNotice("Session revoked on-chain. V47 will reconcile the revocation for every device; direct withdrawals and direct position closes remain available.");
    });
  }

  const sessionProgress = useMemo(() => sessionState
    ? Math.min(100, Number(sessionState.spentNotionalWei * 10_000n / (sessionState.maxCumulativeNotionalWei || 1n)) / 100)
    : 0, [sessionState]);

  return <main className="funding-page">
    <section className="funding-hero">
      <div>
        <span className="eyebrow"><ShieldCheck size={14}/> V45 AUTHORIZED TRADING ACCOUNT</span>
        <h1>Deposit once. Trade at terminal speed.</h1>
        <p>Funds remain in an on-chain liability ledger. A scoped P-256 session signs individual intents; the sequencer sponsors gas but cannot withdraw your balance.</p>
      </div>
      <div className="funding-account-card glass-panel">
        <span><small>Trading balance</small><strong>{authoritativeBalance.toFixed(4)} ETH</strong><em>${availableUsd.toLocaleString(undefined,{maximumFractionDigits:2})}</em></span>
        <span><small>Custody backing</small><strong className={accountState?.solvent === false ? "negative" : "positive"}>{accountHealth}</strong><em>{accountState ? `${fromWad(accountState.routerEthWei, 6).toFixed(3)} ETH router custody` : "Awaiting live ledger"}</em></span>
        <span><small>Session</small><strong className={sessionActive ? "positive" : "pending"}>{sessionState?.active ? "Authorized" : indexedSession ? "Indexed active" : "Inactive"}</strong><em>{sessionState ? `Nonce ${sessionState.nextNonce} · ${sessionProgress.toFixed(1)}% cap used` : indexedSession ? `Nonce ${indexedSession.next_nonce} · indexed block ${indexedSession.source_block}` : "Wallet confirms setup only"}</em></span>
        <span><small>Account</small><strong>{shortAddress(account)}</strong><em>Withdraw or revoke anytime</em></span>
      </div>
      <div className="v47-indexed-proof"><Database size={14}/><span><b>V47 canonical recovery</b><small>{indexed?.head ? `Indexed through block ${indexed.head.blockNumber} · ${indexed.sessions.length} session record(s) · ${indexed.positions.length} position record(s)` : "Start npm run indexer:v47 to enable cross-device account history and session recovery."}</small></span></div>
    </section>

    <section className="funding-grid">
      <div className="funding-panel glass-panel">
        <div className="funding-tabs">
          <button className={tab === "deposit" ? "active" : ""} onClick={() => setTab("deposit")}><ArrowDownToLine size={16}/>Deposit</button>
          <button className={tab === "withdraw" ? "active" : ""} onClick={() => setTab("withdraw")}><ArrowUpFromLine size={16}/>Withdraw</button>
        </div>

        {tab === "deposit" ? <div className="funding-form">
          <div className="network-line"><span><i>RH</i><b>Robinhood Chain sandbox</b><small>Local chain ID 31337 · production target 4663</small></span><strong>{configured ? "V45 ready" : "Not configured"}</strong></div>
          <label>V45 account router<div className="address-box"><code>{router ?? "Run npm run chain:v45"}</code><button onClick={copyAddress} disabled={!router}>{copied ? <Check size={16}/> : <Copy size={16}/>}</button></div></label>
          <div className="qr-placeholder"><QrCode size={76}/><span><strong>Contract deposit</strong><small>Use the connected wallet transaction—do not manually send assets on unsupported networks.</small></span></div>
          <label>Deposit amount<div className="amount-box"><input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal"/><b>ETH</b></div></label>
          <button className="funding-primary" onClick={submitDeposit} disabled={busy}><ArrowDownToLine size={17}/>{busy ? "Confirming…" : "Deposit to V45 ledger"}</button>
          <p className="funding-warning">V45 is an unaudited local sandbox. Never fund it with public-chain assets.</p>
        </div> : <div className="funding-form">
          <div className="withdraw-destination"><WalletCards size={18}/><span><small>Direct withdrawal destination</small><strong>{shortAddress(account)}</strong></span><Check size={16}/></div>
          <label>Withdrawal amount<div className="amount-box"><input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal"/><b>ETH</b></div></label>
          <div className="quick-amounts"><button onClick={() => setAmount((authoritativeBalance*.25).toFixed(4))}>25%</button><button onClick={() => setAmount((authoritativeBalance*.5).toFixed(4))}>50%</button><button onClick={() => setAmount((authoritativeBalance*.75).toFixed(4))}>75%</button><button onClick={() => setAmount(authoritativeBalance.toFixed(4))}>Max</button></div>
          <div className="withdraw-review"><span><small>Available</small><strong>{authoritativeBalance.toFixed(4)} ETH</strong></span><span><small>Protocol fee</small><strong>0 ETH</strong></span><span><small>Destination</small><strong>Connected wallet</strong></span></div>
          <button className="funding-primary" onClick={submitWithdrawal} disabled={busy}><ArrowUpFromLine size={17}/>{busy ? "Confirming…" : "Withdraw directly"}</button>
          <p className="funding-warning">The sequencer cannot call this withdrawal path. Only the account owner can withdraw.</p>
        </div>}

        <div className="v45-session-card">
          <header><span><KeyRound size={17}/><strong>Authorize-once session</strong></span><button onClick={() => { void run(async () => { const next = account ?? await connect(); await refresh(next, sessionKey); setNotice("V45 ledger and session state refreshed."); }); }} disabled={busy}><RefreshCw size={14}/>Refresh</button></header>
          <p>Allows Spot Buy, Spot Sell, Long, Short, Close Long, and Close Short. Every signed intent is nonce-bound, deadline-bound, market-bound, and replay-protected.</p>
          <div className="withdraw-review"><span><small>Per intent</small><strong>{MAX_INTENT_ETH.toFixed(2)} ETH</strong></span><span><small>Cumulative</small><strong>{MAX_CUMULATIVE_ETH.toFixed(2)} ETH</strong></span><span><small>Expires</small><strong>{sessionState ? new Date(sessionState.validUntil * 1000).toLocaleTimeString([], {hour:"numeric", minute:"2-digit"}) : `${SESSION_HOURS} hours`}</strong></span></div>
          {sessionActive ? <button className="funding-primary danger" onClick={revokeSession} disabled={busy}><Power size={17}/>Revoke instant execution</button> : <button className="funding-primary" onClick={createSession} disabled={busy}><Zap size={17}/>Authorize instant execution</button>}
        </div>

        {notice && <div className="funding-notice"><Check size={15}/>{notice}</div>}
      </div>

      <aside className="funding-side">
        <div className="funding-security glass-panel"><ShieldCheck size={20}/><span><strong>Bounded authority—not custody surrender</strong><small>The browser stores an ephemeral P-256 session key in session storage for this tab. The on-chain router enforces actions, expiry, nonce, and limits independently.</small></span></div>
        <div className="funding-history glass-panel">
          <header><span><Clipboard size={17}/><strong>Account activity</strong></span><small>{history.length} records</small></header>
          {history.length === 0 ? <div className="funding-empty-activity"><small>No V45 account activity yet.</small></div> : history.map((item) => <div key={item.id}><span className={`history-icon ${item.type}`}>{item.type === "deposit" ? <ArrowDownToLine size={15}/> : item.type === "withdrawal" ? <ArrowUpFromLine size={15}/> : <KeyRound size={15}/>}</span><span><strong>{item.type === "deposit" ? "Deposit" : item.type === "withdrawal" ? "Withdrawal" : "Session"}</strong><small>{item.time}{item.hash ? ` · ${shortAddress(item.hash)}` : ""}</small></span><span><b>{item.amount ? `${item.type === "deposit" ? "+" : "-"}${item.amount.toFixed(4)} ETH` : item.status}</b><small className={item.status === "Confirmed" ? "positive" : "pending"}>{item.status}</small></span></div>)}
        </div>
      </aside>
    </section>
  </main>;
}
