import fs from "node:fs";

const screen = fs.readFileSync("components/MarketScreen.tsx", "utf8");
const ribbon = fs.readFileSync("components/MarketBattleRibbon.tsx", "utf8");
const map = fs.readFileSync("components/MarketLiquidationMap.tsx", "utf8");
const manager = fs.readFileSync("components/MarketPositionManager.tsx", "utf8");
const css = fs.readFileSync("app/globals.css", "utf8");

const checks: Array<[string, boolean]> = [
  ["workspace layouts or newer resizable chart workspace", (screen.includes('"trade" | "focus" | "research"') && screen.includes("workspace-mode-switch")) || (screen.includes("showSideTape") && screen.includes("showBottomPanel") && screen.includes("v37-chart-resizer"))],
  ["keyboard buy sell long short", screen.includes('key === "b"') && screen.includes('event.shiftKey && key === "s"') && screen.includes('key === "l"') && screen.includes('key === "s"')],
  ["keyboard amount and leverage presets", screen.includes("AMOUNTS") && screen.includes("LEVERAGES") && screen.includes('["q", "w", "e", "r"]')],
  ["unified four-action ticket", screen.includes('selectTradeMode("buy")') && screen.includes('selectTradeMode("sell")') && screen.includes('selectTradeMode("long")') && screen.includes('selectTradeMode("short")')],
  ["BattlePool ribbon", ribbon.includes("Free / reserved") && ribbon.includes("Executable PNL") && ribbon.includes("Long / short OI")],
  ["liquidation map", map.includes("Battle map") && map.includes("liquidation-marker") && map.includes("Public liquidation-cluster indexing")],
  ["professional position controls", manager.includes("closePosition(position.id, fraction)") && manager.includes("addCollateral") && manager.includes("stopLossCap: position.entryCap")],
  ["spot executable manager", manager.includes("getHoldingPnl") && manager.includes("sellHolding(holding.id, fraction)")],
  ["readable V35 typography", css.includes("PERPHOOD V35") && css.includes("font-size:12px") && css.includes("font-size:15px")],
  ["single selected-market workspace", screen.includes("MarketChart") && (screen.includes("MarketPositionManager") || screen.includes("WorkspaceTradeTicket")) && screen.includes("TerminalDataPanel")],
];

for (const [name, pass] of checks) {
  if (!pass) throw new Error(`V35 smoke failed: ${name}`);
  console.log(`PASS  ${name}`);
}
console.log(`V35 complete trading workspace smoke passed (${checks.length}/${checks.length}).`);
