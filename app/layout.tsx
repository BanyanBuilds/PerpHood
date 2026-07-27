import type { Metadata } from "next";
import "./globals.css";
import { MarketProvider } from "@/components/MarketProvider";
import { TerminalPerformanceProvider } from "@/components/TerminalPerformanceProvider";
import { UserStateProvider } from "@/components/UserStateProvider";

export const metadata: Metadata = {
  title: "PERPHOOD — Spot × Perps BattlePool",
  description: "PerpHood combines spot buys, spot sells, leveraged longs, leveraged shorts, executable live PNL, and liquidation-driven liquidity in one Robinhood Chain BattlePool.",
  icons: { icon: "/favicon.ico", apple: "/apple-icon.png" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><UserStateProvider><TerminalPerformanceProvider><MarketProvider>{children}</MarketProvider></TerminalPerformanceProvider></UserStateProvider></body></html>;
}
