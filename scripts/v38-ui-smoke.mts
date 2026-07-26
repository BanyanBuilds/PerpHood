import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (file: string) => readFileSync(resolve(root, file), "utf8");
const screen = read("components/MarketScreen.tsx");
const alerts = read("components/MarketAlertCenter.tsx");
const data = read("components/TerminalDataPanel.tsx");
const chart = read("components/MarketChart.tsx");
const css = read("app/globals.css");
const alertEngine = read("lib/market-alerts.ts");

const checks: Array<[string, boolean]> = [
  ["functional market alert button", screen.includes("MarketAlertCenter") && screen.includes("alertUnread")],
  ["chart publishes one live snapshot", chart.includes("onLiveSnapshot") && chart.includes("marketCap")],
  ["saved per-coin alert rules", alerts.includes("perphood-v38-alert-rules") && alerts.includes("localStorage.setItem")],
  ["outside-click alert dismissal", alerts.includes("useOutsideDismiss")],
  ["market-cap and whale alerts", alertEngine.includes("Market cap above") && alertEngine.includes("Whale trade")],
  ["liquidation-cluster alerts", alertEngine.includes("Short squeeze cluster") && alertEngine.includes("Long cascade cluster")],
  ["developer and solvency alerts", alertEngine.includes("Developer sell") && alertEngine.includes("Free WETH below")],
  ["pulse data tab", screen.includes('"Pulse"') && data.includes('tab === "Pulse"')],
  ["public liquidation pressure", data.includes("Liquidation pressure") && data.includes("wallet direction remains private")],
  ["market defense score", data.includes("Market defense") && data.includes("Manipulation checks")],
  ["readable 11px minimum alert UI", !/font-size:(?:[0-9]|10)(?:\.\d+)?px/.test(css.slice(css.indexOf("PERPHOOD V38")))],
  ["no-scroll workspace preserved", css.includes("v37-market-shell") && css.includes("overflow:hidden")],
];

for (const [label, ok] of checks) {
  if (!ok) throw new Error(`V38 UI smoke failed: ${label}`);
  console.log(`PASS  ${label}`);
}
console.log(`V38 alerts and risk workspace smoke passed (${checks.length}/${checks.length}).`);
