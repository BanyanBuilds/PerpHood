import Link from "next/link";
import { Activity, Cloud, Database, Gauge, Network, Rocket, Server, ShieldCheck, Workflow } from "lucide-react";

const consoles = [
  { href: "/admin/mainnet", label: "V59 Mainnet Preflight", detail: "Live RPC, deployer, factory bytecode and closed/paused activation gates", Icon: Rocket },
  { href: "/admin/user-state", label: "V53 User State", detail: "Supabase presets, workspaces, watchlists, likes and alerts", Icon: Cloud },
  { href: "/admin/completion", label: "V52 Product Completion", detail: "Canonical build inventory, blockers and 100K–1M-user topology", Icon: Workflow },
  { href: "/admin/chain-assault", label: "V51 Chain Assault", detail: "Stale-quote, rollback and hostile-actor coverage", Icon: ShieldCheck },
  { href: "/admin/invariants", label: "V50 Settlement Invariants", detail: "Conservation, liabilities and executable-payout checks", Icon: Gauge },
  { href: "/admin/data-plane", label: "V48 Data Plane", detail: "RPC quorum, market streams, candles and replication", Icon: Network },
  { href: "/admin/indexer", label: "V47 Indexer", detail: "Canonical history, reorg recovery and reconciliation", Icon: Database },
  { href: "/admin/keeper", label: "V46 Keeper Network", detail: "Durable orders, trigger execution and liquidations", Icon: Server },
  { href: "/admin/launchpad", label: "Real Launch Registry", detail: "Confirmed Robinhood Chain factory deployments and explorer receipts", Icon: Activity },
] as const;

export default function AdminPage() {
  return <main className="v52-admin-hub">
    <header><span><Workflow size={18}/>LEVERAGE X BUILD CENTER</span><h1>Development Operations</h1><p>Internal build consoles only. These pages do not indicate public-fund or testnet approval.</p></header>
    <section>{consoles.map(({ href, label, detail, Icon }) => <Link href={href} key={href}><Icon size={18}/><span><b>{label}</b><small>{detail}</small></span></Link>)}</section>
  </main>;
}
