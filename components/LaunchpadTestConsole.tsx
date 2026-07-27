"use client";

import Link from "next/link";
import { Activity, ArrowUpRight, Database, RefreshCcw, Rocket, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

type LaunchRow = {
  chain_id: number;
  network: "testnet" | "mainnet";
  factory_address: string;
  market_address: string;
  token_address: string;
  creator_address: string;
  transaction_hash: string;
  block_number: number;
  name: string;
  symbol: string;
  image_url: string;
  metadata_uri: string;
  creator_buy_wei: string;
  creator_tokens_out_wad: string;
  market_cap_eth_wad: string;
  status: string;
};

function short(value: string) {
  return value.length > 18 ? `${value.slice(0, 9)}…${value.slice(-7)}` : value;
}

function explorer(row: LaunchRow) {
  return row.chain_id === 4_663 ? "https://robinhoodchain.blockscout.com" : "https://explorer.testnet.chain.robinhood.com";
}

function formatUnits(value: string, decimals = 18, precision = 6) {
  const amount = BigInt(value || "0");
  const base = 10n ** BigInt(decimals);
  const whole = amount / base;
  const fraction = (amount % base).toString().padStart(decimals, "0").slice(0, precision).replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

export function LaunchpadTestConsole() {
  const [rows, setRows] = useState<LaunchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/v55/launches?limit=100", { cache: "no-store" });
      const body = await response.json() as { ok?: boolean; launches?: LaunchRow[]; error?: string };
      if (!response.ok || !body.ok) throw new Error(body.error || "Launch registry could not be loaded.");
      setRows(body.launches ?? []);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Launch registry could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const totals = useMemo(() => ({
    tokens: rows.length,
    testnet: rows.filter((row) => row.chain_id === 46_630).length,
    mainnet: rows.filter((row) => row.chain_id === 4_663).length,
  }), [rows]);

  return <main className="v41-console-page">
    <header className="v41-console-head">
      <div>
        <span className="eyebrow"><Rocket size={14}/> LEVERAGE X V55 REAL LAUNCH REGISTRY</span>
        <h1>Robinhood Chain launches</h1>
        <p>Only canonically confirmed factory deployments are shown. No local simulator, bundled token, fake balance, or fabricated transaction is included.</p>
      </div>
      <div className="v41-console-head-actions">
        <Link href="/terminal?panel=launch"><Rocket size={14}/>Launch token</Link>
        <button type="button" onClick={() => void refresh()} disabled={loading}><RefreshCcw size={14}/>Refresh registry</button>
      </div>
    </header>

    <section className="v41-console-metrics">
      <article><Database size={17}/><span><small>Confirmed markets</small><b>{totals.tokens}</b></span></article>
      <article><Activity size={17}/><span><small>Testnet</small><b>{totals.testnet}</b></span></article>
      <article><ShieldCheck size={17}/><span><small>Mainnet</small><b>{totals.mainnet}</b></span></article>
      <article><Rocket size={17}/><span><small>Registry source</small><b>On-chain</b></span></article>
    </section>

    {error && <section className="v42-sandbox-notice"><ShieldCheck size={18}/><span><strong>Registry unavailable</strong><small>{error}</small></span></section>}

    <section className="v41-console-main">
      <header className="v41-selected-market"><Database size={18}/><span><strong>Confirmed token contracts</strong><small>Factory receipt, token identity, metadata hash, and one-billion supply are verified before insertion.</small></span></header>
      <div className="v41-console-ledger">
        <div>
          {!loading && rows.length === 0 && <p>No real LEVERAGE X markets have been launched yet.</p>}
          {loading && <p>Reading the confirmed launch registry…</p>}
          {rows.map((row) => {
            const base = explorer(row);
            return <article key={`${row.chain_id}-${row.token_address}`}>
              <span><b>${row.symbol} · {row.name}</b><small>{row.network} · block {row.block_number.toLocaleString("en-US")}</small></span>
              <strong>{formatUnits(row.creator_buy_wei)} ETH genesis buy</strong>
              <em>{formatUnits(row.creator_tokens_out_wad, 18, 2)} tokens</em>
              <small>Token {short(row.token_address)} · Market {short(row.market_address)}</small>
              <span>
                <a href={`${base}/address/${row.token_address}`} target="_blank" rel="noreferrer">Token <ArrowUpRight size={11}/></a>
                <a href={`${base}/address/${row.market_address}`} target="_blank" rel="noreferrer">Market <ArrowUpRight size={11}/></a>
                <a href={`${base}/tx/${row.transaction_hash}`} target="_blank" rel="noreferrer">Transaction <ArrowUpRight size={11}/></a>
              </span>
            </article>;
          })}
        </div>
      </div>
    </section>
  </main>;
}
