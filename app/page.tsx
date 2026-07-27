import { Suspense } from "react";
import { TerminalHub } from "@/components/TerminalHub";

export default function Home() {
  return <Suspense fallback={<main className="terminal-hub-page"><div className="terminal-loading">Opening LEVERAGE X…</div></main>}><TerminalHub /></Suspense>;
}
