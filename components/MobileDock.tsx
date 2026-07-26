"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, LayoutDashboard, Trophy, WalletCards } from "lucide-react";

export function MobileDock() {
  const pathname = usePathname();
  const links = [
    ["Movers", "/", BarChart3],
    ["Terminal", "/terminal", LayoutDashboard],
    ["Portfolio", "/positions", WalletCards],
    ["League", "/leaderboard", Trophy],
  ] as const;
  const active = (href: string) => href === "/" ? pathname === "/" : href === "/terminal" ? pathname.startsWith("/terminal") || pathname.startsWith("/market/") : pathname.startsWith(href);
  return <nav className="mobile-dock">{links.map(([label, href, Icon]) => <Link key={label} className={active(href) ? "active" : ""} href={href}><Icon size={19} /><span>{label}</span></Link>)}</nav>;
}
