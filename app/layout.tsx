import type { Metadata, Viewport } from "next";
import "./globals.css";
import { MarketProvider } from "@/components/MarketProvider";
import { TerminalPerformanceProvider } from "@/components/TerminalPerformanceProvider";
import { UserStateProvider } from "@/components/UserStateProvider";
import { LEVERAGEX_BRAND } from "@/lib/brand";

export const metadata: Metadata = {
  metadataBase: new URL("https://leveragex.fun"),
  title: {
    default: `${LEVERAGEX_BRAND.name} — Spot × Perps on Robinhood Chain`,
    template: `%s · ${LEVERAGEX_BRAND.name}`,
  },
  description: "Leverage X combines real memecoin launches, spot execution, leveraged longs and shorts, executable PNL, and liquidation-driven liquidity on Robinhood Chain.",
  applicationName: LEVERAGEX_BRAND.name,
  manifest: "/site.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  openGraph: {
    type: "website",
    siteName: LEVERAGEX_BRAND.name,
    title: `${LEVERAGEX_BRAND.name} — Spot × Perps on Robinhood Chain`,
    description: "Launch and trade Robinhood Chain memecoins through one spot × perps terminal.",
    url: "https://leveragex.fun",
    images: [{ url: LEVERAGEX_BRAND.ogImagePath, width: 1200, height: 630, alt: "Leverage X logo" }],
  },
  twitter: {
    card: "summary_large_image",
    title: `${LEVERAGEX_BRAND.name} — Spot × Perps on Robinhood Chain`,
    description: "Launch and trade Robinhood Chain memecoins through one spot × perps terminal.",
    images: [LEVERAGEX_BRAND.ogImagePath],
  },
};

export const viewport: Viewport = {
  themeColor: "#111313",
  colorScheme: "dark",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><UserStateProvider><TerminalPerformanceProvider><MarketProvider>{children}</MarketProvider></TerminalPerformanceProvider></UserStateProvider></body></html>;
}
