"use client";

/* eslint-disable @next/next/no-img-element -- X media and profile URLs are rendered from the official API response. */

import { Download, ExternalLink, FileUp, LoaderCircle, Plus, RadioTower, RefreshCw, Search, Sparkles, Trash2, UploadCloud, Users, X as XIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildLaunchDraft, detectEvmAddresses, formatPostAge, sanitizeXUsername, suggestTickers, type XLaunchDraft, type XLaunchFeedResponse, type XLaunchPost } from "@/lib/x-launch-feed";

const STORAGE_KEY = "perphood-x-launch-feed-v1";
const DEFAULT_REFRESH_MS = 15_000;

type SavedFeedSettings = {
  accounts: string[];
  keywords: string;
  autoRefresh: boolean;
};

function loadSettings(): SavedFeedSettings {
  if (typeof window === "undefined") return { accounts: [], keywords: "", autoRefresh: true };
  try {
    const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}") as Partial<SavedFeedSettings>;
    return {
      accounts: Array.isArray(saved.accounts) ? saved.accounts.map(sanitizeXUsername).filter(Boolean).slice(0, 20) : [],
      keywords: typeof saved.keywords === "string" ? saved.keywords : "",
      autoRefresh: typeof saved.autoRefresh === "boolean" ? saved.autoRefresh : true,
    };
  } catch {
    return { accounts: [], keywords: "", autoRefresh: true };
  }
}

function metric(value: number) {
  return value >= 1_000_000 ? `${(value / 1_000_000).toFixed(1)}M` : value >= 1_000 ? `${(value / 1_000).toFixed(1)}K` : String(value);
}

function downloadAccounts(accounts: string[]) {
  const blob = new Blob([JSON.stringify({ accounts }, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "perphood-x-accounts.json";
  anchor.click();
  URL.revokeObjectURL(url);
}

async function readAccountFile(file: File) {
  const text = await file.text();
  let values: string[] = [];
  try {
    const parsed = JSON.parse(text) as string[] | { accounts?: string[] };
    values = Array.isArray(parsed) ? parsed : parsed.accounts ?? [];
  } catch {
    values = text.split(/[\s,;]+/);
  }
  return [...new Set(values.map(sanitizeXUsername).filter(Boolean))].slice(0, 20);
}

function XPostCard({ post, onLaunch }: { post: XLaunchPost; onLaunch: (draft: XLaunchDraft) => void }) {
  const tickers = useMemo(() => suggestTickers(post, 5), [post]);
  const addresses = useMemo(() => detectEvmAddresses(post.text), [post.text]);
  const media = post.media[0];
  const postUrl = `https://x.com/${post.author.username}/status/${post.id}`;

  return <article className="x-launch-post">
    <header>
      {post.author.profileImageUrl ? <img src={post.author.profileImageUrl} alt="" /> : <span className="x-launch-avatar">{post.author.name.slice(0, 1).toUpperCase()}</span>}
      <span><strong>{post.author.name}{post.author.verified ? <i>✓</i> : null}</strong><small>@{post.author.username} · {formatPostAge(post.createdAt)}</small></span>
      <a href={postUrl} target="_blank" rel="noreferrer" aria-label="Open post on X"><ExternalLink size={14} /></a>
    </header>
    <p>{post.text}</p>
    {media && (media.url || media.previewImageUrl) ? <a className="x-launch-media" href={postUrl} target="_blank" rel="noreferrer"><img src={media.url || media.previewImageUrl} alt="Post media" /></a> : null}
    {addresses.length ? <div className="x-launch-addresses">{addresses.map((address) => <button key={address} onClick={() => navigator.clipboard?.writeText(address)} title="Copy contract address"><span>CA</span>{address.slice(0, 7)}…{address.slice(-5)}</button>)}</div> : null}
    <div className="x-launch-metrics"><span>♡ {metric(post.metrics.likes)}</span><span>↻ {metric(post.metrics.reposts)}</span><span>◌ {metric(post.metrics.replies)}</span><span>◇ {metric(post.metrics.quotes)}</span></div>
    <footer>
      <span><Sparkles size={13} />Launch suggestions</span>
      <div>{tickers.map((ticker, index) => <button key={ticker} className={index === 0 ? "primary" : ""} onClick={() => onLaunch(buildLaunchDraft(post, ticker))}>${ticker}</button>)}</div>
    </footer>
  </article>;
}

export function XLaunchFeedPanel({ onClose, onLaunchDraft }: { onClose: () => void; onLaunchDraft: (draft: XLaunchDraft) => void }) {
  const initial = useMemo(loadSettings, []);
  const [accounts, setAccounts] = useState(initial.accounts);
  const [keywords, setKeywords] = useState(initial.keywords);
  const [autoRefresh, setAutoRefresh] = useState(initial.autoRefresh);
  const [accountDraft, setAccountDraft] = useState("");
  const [tab, setTab] = useState<"radar" | "accounts">("radar");
  const [feed, setFeed] = useState<XLaunchFeedResponse>({ configured: false, mode: "unconfigured", posts: [] });
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ accounts, keywords, autoRefresh }));
  }, [accounts, autoRefresh, keywords]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (accounts.length) params.set("accounts", accounts.join(","));
      if (keywords.trim()) params.set("q", keywords.trim());
      const response = await fetch(`/api/x-launch-feed?${params.toString()}`, { cache: "no-store" });
      const data = await response.json() as XLaunchFeedResponse;
      setFeed(data);
      setLastUpdated(Date.now());
      if (!response.ok && data.message) setError(data.message);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "X Launch Feed could not refresh.");
    } finally {
      setLoading(false);
    }
  }, [accounts, keywords]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    if (!autoRefresh) return;
    const timer = window.setInterval(() => void refresh(), DEFAULT_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [autoRefresh, refresh]);

  const addAccount = () => {
    const next = sanitizeXUsername(accountDraft);
    if (!next) return;
    setAccounts((current) => current.includes(next) ? current : [...current, next].slice(0, 20));
    setAccountDraft("");
  };

  const importAccounts = async (file?: File) => {
    if (!file) return;
    try {
      const imported = await readAccountFile(file);
      setAccounts((current) => [...new Set([...current, ...imported])].slice(0, 20));
    } catch {
      setError("Account list could not be imported.");
    }
  };

  return <div className="x-launch-feed-panel">
    <div className="x-launch-feed-topline">
      <span><RadioTower size={16} /><strong>X Launch Feed</strong><small>Posts → 5 tickers → Launcher</small></span>
      <div>
        <button className={autoRefresh ? "active" : ""} onClick={() => setAutoRefresh((value) => !value)} title="Toggle automatic refresh"><RefreshCw size={14} /></button>
        <button onClick={onClose} aria-label="Close X Launch Feed"><XIcon size={15} /></button>
      </div>
    </div>

    <div className="x-launch-feed-tabs">
      <button className={tab === "radar" ? "active" : ""} onClick={() => setTab("radar")}><RadioTower size={13} />Launch Radar</button>
      <button className={tab === "accounts" ? "active" : ""} onClick={() => setTab("accounts")}><Users size={13} />Accounts <b>{accounts.length}</b></button>
    </div>

    {tab === "radar" ? <>
      <div className="x-launch-query-row">
        <label><Search size={13} /><input value={keywords} onChange={(event) => setKeywords(event.target.value)} onKeyDown={(event) => event.key === "Enter" && void refresh()} placeholder="Keywords, cashtags, phrases" /></label>
        <button onClick={() => void refresh()} disabled={loading}>{loading ? <LoaderCircle className="spin" size={14} /> : <RefreshCw size={14} />}</button>
      </div>
      <div className="x-launch-feed-status">
        <span className={feed.configured ? "online" : "offline"}><i />{feed.configured ? "X API connected" : "X API not configured"}</span>
        <small>{lastUpdated ? `Updated ${new Date(lastUpdated).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}` : "Waiting for first refresh"}{feed.rateLimit?.remaining !== undefined ? ` · ${feed.rateLimit.remaining} requests left` : ""}</small>
      </div>
      <div className="x-launch-feed-scroll">
        {feed.posts.map((post) => <XPostCard key={post.id} post={post} onLaunch={onLaunchDraft} />)}
        {!feed.posts.length && <div className="x-launch-empty"><UploadCloud size={28} /><strong>{feed.configured ? "No launch posts matched" : "Connect the official X API"}</strong><p>{error || feed.message || "Add monitored accounts or keywords. PerpHood does not invent social posts."}</p>{!feed.configured ? <code>X_BEARER_TOKEN=</code> : null}</div>}
      </div>
    </> : <div className="x-launch-account-manager">
      <header><strong>Monitored accounts</strong><small>Import usernames, not another terminal’s private feed.</small></header>
      <div className="x-launch-account-add"><span>@</span><input value={accountDraft} onChange={(event) => setAccountDraft(event.target.value)} onKeyDown={(event) => event.key === "Enter" && addAccount()} placeholder="username" /><button onClick={addAccount}><Plus size={14} />Add</button></div>
      <div className="x-launch-account-list">{accounts.map((account) => <div key={account}><span>@{account}</span><button onClick={() => setAccounts((current) => current.filter((value) => value !== account))}><Trash2 size={13} /></button></div>)}{!accounts.length && <p>No account filter. The keyword rule searches the public recent-post feed.</p>}</div>
      <div className="x-launch-account-actions">
        <button onClick={() => fileRef.current?.click()}><FileUp size={14} />Import</button>
        <button onClick={() => downloadAccounts(accounts)} disabled={!accounts.length}><Download size={14} />Export</button>
        <button onClick={() => setAccounts([])} disabled={!accounts.length}><Trash2 size={14} />Clear</button>
        <input ref={fileRef} hidden type="file" accept=".json,.txt,.csv" onChange={(event) => void importAccounts(event.target.files?.[0])} />
      </div>
      <div className="x-launch-account-note"><strong>Why native?</strong><p>Axiom and Padre do not publish an official importable X-feed API. PerpHood owns its rules, account lists, ticker suggestions, and one-click launch path.</p></div>
    </div>}
  </div>;
}
