import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (file: string) => readFileSync(resolve(root, file), "utf8");
const screen = read("components/MarketScreen.tsx");
const chart = read("components/MarketChart.tsx");
const ticket = read("components/WorkspaceTradeTicket.tsx");
const css = read("app/globals.css");

const checks: Array<[string, boolean]> = [
  ["no-scroll fixed chart viewport", css.includes("height:calc(100dvh - var(--header-height,58px))") && css.includes("overflow:hidden")],
  ["draggable chart/lower-panel divider", screen.includes("v37-chart-resizer") && screen.includes("onPointerMove={resize}")],
  ["optional side trade tape", screen.includes("showSideTape") && screen.includes("MarketLiveTape")],
  ["optional lower data panel", screen.includes("showBottomPanel") && screen.includes("TerminalDataPanel")],
  ["simple four-action execution rail", ticket.includes('["buy", "sell", "long", "short"]') && ticket.includes("v37-side-tabs")],
  ["compact token safety section", ticket.includes("Token safety") && ticket.includes("Mint authority") && ticket.includes("Freeze authority")],
  ["persistent chart preferences", chart.includes("perphood-v37-chart-preferences") && chart.includes("localStorage.setItem")],
  ["outside-click chart settings dismissal", chart.includes("useOutsideDismiss") && chart.includes("settingsRootRef")],
  ["curated wallet and liquidation layers", chart.includes("Wallet intelligence") && chart.includes("Liquidation clusters") && chart.includes("Pending orders")],
  ["clean defaults", chart.includes("showSmart: false") && chart.includes("showSnipers: false") && chart.includes("showTrades: false")],
  ["market-cap and token-price modes", chart.includes('displayMode: "marketcap"') && chart.includes('updatePreference("displayMode", "price")')],
  ["GMGN-style chart controls", css.includes("PERPHOOD V37 — Padre page structure + GMGN chart controls")],
];

for (const [label, ok] of checks) {
  if (!ok) throw new Error(`V37 smoke failed: ${label}`);
  console.log(`PASS  ${label}`);
}
console.log(`V37 clean chart workspace smoke passed (${checks.length}/${checks.length}).`);
