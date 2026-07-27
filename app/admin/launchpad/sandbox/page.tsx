import Link from "next/link";
import { ArrowLeft, FlaskConical, ShieldCheck } from "lucide-react";

export default function LaunchpadSandboxPage() {
  return <main className="v42-sandbox-page">
    <header className="v42-sandbox-hero"><div><span className="eyebrow"><FlaskConical size={14}/> LOCAL TOOL REMOVED FROM HOSTED PRODUCT</span><h1>No deployed demo sandbox</h1><p>The production build contains no bundled market or fake chain state. Local contract testing remains available through the repository test commands, not through a public simulator page.</p></div><div><Link href="/admin/launchpad"><ArrowLeft size={14}/>Real launch registry</Link></div></header>
    <section className="v42-sandbox-notice"><ShieldCheck size={20}/><span><strong>Real data only</strong><small>Launches appear after a confirmed Robinhood Chain factory transaction and server-side canonical verification.</small></span></section>
  </main>;
}
