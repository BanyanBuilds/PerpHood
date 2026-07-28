"use client";

import { Activity, BarChart3, Coins, ExternalLink, Flame, RefreshCw, Rocket, Users, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

type Stats = {
  tokensMinted:number; tokensGraduated:number; graduationRate:number; mintedToday:number; mintedThisWeek:number;
  spotVolumeWei:string; perpsOpenInterestWei:string; activePositions:number; activeTraders:number; totalLiquidations:number;
  longShortRatio:number|null; recentGraduates:Array<{marketAddress:string;tokenAddress:string|null;updatedAt:string}>; generatedAt:string;
};

function eth(value:string) { try { const n=Number(BigInt(value))/1e18; return `${n.toLocaleString("en-US",{maximumFractionDigits:n<1?4:2})} ETH`; } catch { return "—"; } }
function shortAddress(value:string) { return `${value.slice(0,6)}…${value.slice(-4)}`; }

export function ProtocolStatsModal({ open, onClose }: { open:boolean; onClose:()=>void }) {
  const [stats,setStats]=useState<Stats|null>(null); const [loading,setLoading]=useState(false); const [error,setError]=useState("");
  const load=useCallback(async()=>{ setLoading(true); setError(""); try { const response=await fetch("/api/protocol/stats",{cache:"no-store"}); const body=await response.json(); if(!response.ok||!body.ok) throw new Error(body.error??"Stats unavailable."); setStats(body); } catch(e){setError(e instanceof Error?e.message:"Stats unavailable.");} finally{setLoading(false);} },[]);
  useEffect(()=>{if(open) void load();},[open,load]);
  useEffect(()=>{if(!open)return; const key=(e:KeyboardEvent)=>{if(e.key==="Escape")onClose();}; window.addEventListener("keydown",key); return()=>window.removeEventListener("keydown",key);},[open,onClose]);
  if(!open)return null;
  return <div className="protocol-stats-backdrop" onMouseDown={(e)=>{if(e.target===e.currentTarget)onClose();}}>
    <section className="protocol-stats-modal" role="dialog" aria-modal="true" aria-label="Leverage X protocol statistics">
      <header><span><BarChart3 size={18}/><div><strong>Protocol Stats</strong><small>Live indexed Robinhood Chain activity</small></div></span><div><button onClick={()=>void load()} disabled={loading} title="Refresh"><RefreshCw size={15} className={loading?"spin":""}/></button><button onClick={onClose} title="Close"><X size={16}/></button></div></header>
      {error ? <div className="protocol-stats-error"><strong>Stats feed unavailable</strong><span>{error}</span><button onClick={()=>void load()}>Try again</button></div> : !stats ? <div className="protocol-stats-loading">Reading authoritative indexer…</div> : <>
        <div className="protocol-stats-heroes"><article><Coins/><span><b>{stats.tokensMinted.toLocaleString()}</b><small>Tokens minted</small></span></article><article><Rocket/><span><b>{stats.tokensGraduated.toLocaleString()}</b><small>Graduated</small></span></article></div>
        <div className="protocol-stats-grid">
          <article><span>Graduation rate</span><b>{(stats.graduationRate*100).toFixed(1)}%</b></article><article><span>Minted today</span><b>{stats.mintedToday.toLocaleString()}</b></article><article><span>Minted this week</span><b>{stats.mintedThisWeek.toLocaleString()}</b></article><article><span>Spot volume</span><b>{eth(stats.spotVolumeWei)}</b></article><article><span>Perps open interest</span><b>{eth(stats.perpsOpenInterestWei)}</b></article><article><span>Open positions</span><b>{stats.activePositions.toLocaleString()}</b></article><article><span>Active traders</span><b>{stats.activeTraders.toLocaleString()}</b></article><article><span>Total liquidations</span><b>{stats.totalLiquidations.toLocaleString()}</b></article><article><span>Long / short</span><b>{stats.longShortRatio==null?"No OI":`${Math.round(stats.longShortRatio*100)}% / ${100-Math.round(stats.longShortRatio*100)}%`}</b></article>
        </div>
        <section className="recent-graduates"><header><span><Flame size={14}/>Recent graduates</span><small>{stats.recentGraduates.length?"Newest first":"None indexed yet"}</small></header>{stats.recentGraduates.map((item)=><div key={item.marketAddress}><span><Rocket size={13}/><b>{item.tokenAddress?shortAddress(item.tokenAddress):shortAddress(item.marketAddress)}</b></span><small>{new Date(item.updatedAt).toLocaleString()}</small><ExternalLink size={12}/></div>)}</section>
        <footer><span><Activity size={12}/>On-chain indexed data only</span><span><Users size={12}/>Updated {new Date(stats.generatedAt).toLocaleTimeString()}</span></footer>
      </>}
    </section>
  </div>;
}
