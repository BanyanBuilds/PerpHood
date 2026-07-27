"use client";

import { Bell, BellRing, Check, RotateCcw, ShieldAlert, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { freeWeth, poolFromToken } from "@/lib/battle-pool";
import {
  buildLiquidationClusters,
  buildMarketDefensePulse,
  defaultMarketAlertRules,
  evaluateMarketAlerts,
  type MarketAlertRule,
  type MarketAlertSignal,
} from "@/lib/market-alerts";
import type { Token } from "@/lib/types";
import { useMarkets } from "./MarketProvider";
import { useOutsideDismiss } from "./useOutsideDismiss";
import { useUserState } from "./UserStateProvider";

const MAX_HISTORY = 30;

export function MarketAlertCenter({ token, marketCap, open, onClose, onUnreadChange }: {
  token: Token;
  marketCap: number;
  open: boolean;
  onClose: () => void;
  onUnreadChange?: (count: number) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const armedAtRef = useRef(Date.now() + 900);
  const seenRef = useRef(new Set<string>());
  const hydratedSlugRef = useRef("");
  const { events: allEvents, positions } = useMarkets();
  const userState = useUserState();
  const storageKey = `perphood-v38-alert-rules:${token.slug}`;
  const historyKey = `perphood-v38-alert-history:${token.slug}`;
  const [rules, setRules] = useState<MarketAlertRule[]>(() => defaultMarketAlertRules(token));
  const [history, setHistory] = useState<MarketAlertSignal[]>([]);
  const [unread, setUnread] = useState(0);
  const [alertsHydrated, setAlertsHydrated] = useState(false);

  useOutsideDismiss([rootRef], onClose, open);

  useEffect(() => {
    if (!userState.ready || hydratedSlugRef.current === token.slug) return;
    hydratedSlugRef.current = token.slug;
    setAlertsHydrated(false);
    seenRef.current.clear();
    try {
      const synced = userState.getSection<{ rules: MarketAlertRule[]; history: MarketAlertSignal[] } | null>(`market-alerts-v1:${token.slug}`, null);
      const savedRules = synced?.rules ?? (localStorage.getItem(storageKey) ? JSON.parse(localStorage.getItem(storageKey) as string) as MarketAlertRule[] : null);
      const savedHistory = synced?.history ?? (localStorage.getItem(historyKey) ? JSON.parse(localStorage.getItem(historyKey) as string) as MarketAlertSignal[] : null);
      if (savedRules) setRules(savedRules);
      else setRules(defaultMarketAlertRules(token));
      if (savedHistory) {
        const parsed = savedHistory.slice(0, MAX_HISTORY);
        setHistory(parsed);
        parsed.forEach((signal) => seenRef.current.add(signal.fingerprint));
      } else setHistory([]);
    } catch {
      setRules(defaultMarketAlertRules(token));
      setHistory([]);
    }
    setAlertsHydrated(true);
  }, [historyKey, storageKey, token, userState]);

  useEffect(() => {
    if (!alertsHydrated) return;
    localStorage.setItem(storageKey, JSON.stringify(rules));
    userState.setSection(`market-alerts-v1:${token.slug}`, { rules, history: history.slice(0, MAX_HISTORY) });
  }, [alertsHydrated, history, rules, storageKey, token.slug, userState]);

  useEffect(() => {
    if (!alertsHydrated) return;
    localStorage.setItem(historyKey, JSON.stringify(history.slice(0, MAX_HISTORY)));
  }, [alertsHydrated, history, historyKey]);

  useEffect(() => {
    if (open) setUnread(0);
  }, [open]);

  useEffect(() => onUnreadChange?.(unread), [onUnreadChange, unread]);

  const tokenPositions = useMemo(() => positions.filter((position) => position.slug === token.slug), [positions, token.slug]);
  const events = useMemo(() => allEvents.filter((event) => event.slug === token.slug), [allEvents, token.slug]);
  const pool = token.battlePoolVersion ? poolFromToken(token) : null;
  const freeRatio = pool?.realWethBalance ? Math.max(0, Math.min(1, freeWeth(pool) / pool.realWethBalance)) : 1;
  const clusters = useMemo(
    () => buildLiquidationClusters(tokenPositions, marketCap).sort((a, b) => Math.abs(a.distancePercent) - Math.abs(b.distancePercent)),
    [marketCap, tokenPositions],
  );
  const pulse = useMemo(() => buildMarketDefensePulse(token, events, clusters, freeRatio), [clusters, events, freeRatio, token]);

  useEffect(() => {
    if (Date.now() < armedAtRef.current) return;
    const candidates = evaluateMarketAlerts(rules, { token, marketCap, liquidityEth: token.liquidityEth ?? 0, freeWethRatio: freeRatio, events, positions: tokenPositions, clusters });
    const fresh = candidates.filter((signal) => !seenRef.current.has(signal.fingerprint));
    if (!fresh.length) return;
    fresh.forEach((signal) => seenRef.current.add(signal.fingerprint));
    setHistory((current) => [...fresh, ...current].sort((a, b) => b.createdAt - a.createdAt).slice(0, MAX_HISTORY));
    if (!open) setUnread((value) => value + fresh.length);
  }, [clusters, events, freeRatio, marketCap, open, rules, token, tokenPositions]);

  const updateRule = (id: string, patch: Partial<MarketAlertRule>) => setRules((current) => current.map((rule) => rule.id === id ? { ...rule, ...patch } : rule));
  const reset = () => {
    seenRef.current.clear();
    setRules(defaultMarketAlertRules(token));
    setHistory([]);
    setUnread(0);
    armedAtRef.current = Date.now() + 900;
  };

  if (!open) return null;

  return <div ref={rootRef} className="v38-alert-center" role="dialog" aria-label="Market alerts">
    <header>
      <span><BellRing size={17} /><span><strong>Market alerts</strong><small>Saved per coin · visual alerts</small></span></span>
      <div><button type="button" onClick={reset} title="Reset market alerts"><RotateCcw size={14} /></button><button type="button" onClick={onClose} aria-label="Close market alerts"><X size={16} /></button></div>
    </header>

    <div className={`v38-defense-summary ${pulse.status}`}>
      <span><ShieldAlert size={17} /><small>Market defense</small><strong>{Math.round(pulse.score)}/100</strong></span>
      <div><b>{pulse.status.toUpperCase()}</b><small>{pulse.uniqueActors} recent actors · {(pulse.repeatingActorShare * 100).toFixed(0)}% largest share</small></div>
    </div>

    <section className="v38-alert-rules">
      {rules.map((rule) => <div key={rule.id} className={rule.enabled ? "enabled" : ""}>
        <button type="button" className="v38-alert-toggle" onClick={() => updateRule(rule.id, { enabled: !rule.enabled })} aria-label={`${rule.enabled ? "Disable" : "Enable"} ${rule.label}`}><i>{rule.enabled && <Check size={12} />}</i></button>
        <label><span>{rule.label}</span>{rule.unit !== "boolean" ? <span className="v38-alert-input"><input type="number" min="0" step={rule.unit === "usd" ? "100" : rule.unit === "percent" ? "1" : "0.01"} value={Number.isFinite(rule.threshold) ? rule.threshold : 0} onChange={(event) => updateRule(rule.id, { threshold: Math.max(0, Number(event.target.value)) })} /><em>{rule.unit === "usd" ? "$" : rule.unit === "eth" ? "ETH" : "%"}</em></span> : <small>Any verified event</small>}</label>
      </div>)}
    </section>

    <section className="v38-cluster-preview">
      <header><strong>Nearest liquidation pressure</strong><small>Public aggregate only</small></header>
      <div>{pulse.nearestShortCluster ? <span className="short"><b>Shorts</b><strong>{pulse.nearestShortCluster.notionalEth.toFixed(2)} ETH</strong><small>+{pulse.nearestShortCluster.distancePercent.toFixed(1)}% · {pulse.nearestShortCluster.positions} positions</small></span> : <span><b>Shorts</b><small>No nearby cluster</small></span>}{pulse.nearestLongCluster ? <span className="long"><b>Longs</b><strong>{pulse.nearestLongCluster.notionalEth.toFixed(2)} ETH</strong><small>{pulse.nearestLongCluster.distancePercent.toFixed(1)}% · {pulse.nearestLongCluster.positions} positions</small></span> : <span><b>Longs</b><small>No nearby cluster</small></span>}</div>
    </section>

    <section className="v38-alert-history">
      <header><strong>Recent alerts</strong><button type="button" onClick={() => setHistory([])}>Clear</button></header>
      {history.length ? history.slice(0, 8).map((signal) => <article key={signal.id} className={signal.severity}>
        <i><Bell size={13} /></i><span><strong>{signal.title}</strong><small>{signal.detail}</small></span><time>{formatAge(signal.createdAt)}</time>
      </article>) : <p>Alerts are armed. New conditions will appear here.</p>}
    </section>
  </div>;
}

function formatAge(timestamp: number) {
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  return `${Math.floor(seconds / 3600)}h`;
}
