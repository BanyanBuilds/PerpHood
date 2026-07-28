"use client";
import { useState } from "react";

type Result = Record<string, unknown>;
export default function DeployLaunchContractsPage() {
  const [token, setToken] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [locker, setLocker] = useState("");
  const [factory, setFactory] = useState("");
  async function call(method: "GET" | "POST", verify = false) {
    setBusy(true); setResult(null);
    try {
      const qs = verify ? `?locker=${encodeURIComponent(locker)}&factory=${encodeURIComponent(factory)}` : "";
      const response = await fetch(`/api/admin/deploy-launch-contracts${qs}`, {
        method,
        headers: { Authorization: `Bearer ${token}`, ...(method === "POST" ? { "x-leveragex-confirm": "DEPLOY-RH-4663" } : {}) },
      });
      const data = await response.json(); setResult(data);
      if (typeof data.liquidityLocker === "string") setLocker(data.liquidityLocker);
      if (typeof data.launchFactory === "string") setFactory(data.launchFactory);
    } catch (error) { setResult({ error: error instanceof Error ? error.message : "Request failed" }); }
    finally { setBusy(false); }
  }
  function download() {
    if (!result) return;
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a");
    a.href = url; a.download = "leveragex-v81-mainnet-deployment.json"; a.click(); URL.revokeObjectURL(url);
  }
  return <main style={{maxWidth:840,margin:"40px auto",padding:24}}>
    <h1>Leverage X mainnet deployment</h1>
    <p>Step 1: securely deploy and verify the launch factory and permanent liquidity locker on Robinhood Chain 4663.</p>
    <label style={{display:"block",marginTop:24}}>Deployment admin token</label>
    <input type="password" value={token} onChange={(e)=>setToken(e.target.value)} autoComplete="off" style={{width:"100%",padding:12,margin:"8px 0 16px"}} />
    <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
      <button disabled={busy || token.length < 32} onClick={()=>call("GET")}>1. Check readiness</button>
      <button disabled={busy || token.length < 32} onClick={()=>{if(confirm("Deploy real contracts to Robinhood Chain mainnet? This spends ETH for gas.")) call("POST")}}>2. Deploy contracts</button>
      <button disabled={!result} onClick={download}>Download evidence</button>
    </div>
    <hr style={{margin:"28px 0"}} />
    <h2>Verify existing deployment</h2>
    <input placeholder="Liquidity locker address" value={locker} onChange={(e)=>setLocker(e.target.value)} style={{width:"100%",padding:12,marginBottom:8}} />
    <input placeholder="Launch factory address" value={factory} onChange={(e)=>setFactory(e.target.value)} style={{width:"100%",padding:12,marginBottom:12}} />
    <button disabled={busy || token.length < 32 || !locker || !factory} onClick={()=>call("GET", true)}>3. Verify on-chain binding</button>
    {busy && <p>Waiting for Robinhood Chain confirmation…</p>}
    {result && <pre style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere",marginTop:24,padding:16,background:"#111",borderRadius:12}}>{JSON.stringify(result,null,2)}</pre>}
    <p style={{marginTop:20}}>After successful deployment, add the two returned address values to Vercel. They are public contract addresses, not secrets. Keep the private key and admin token server-only.</p>
  </main>;
}
