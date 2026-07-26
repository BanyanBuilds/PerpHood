import fs from "node:fs";

const data = fs.readFileSync("lib/data.ts", "utf8");
const demo = fs.readFileSync("lib/demo-market.ts", "utf8");
const page = fs.readFileSync("app/page.tsx", "utf8");
const screen = fs.readFileSync("components/MarketScreen.tsx", "utf8");
const chart = fs.readFileSync("components/MarketChart.tsx", "utf8");
const stats = fs.readFileSync("components/MarketDexStats.tsx", "utf8");
const panel = fs.readFileSync("components/TerminalDataPanel.tsx", "utf8");
const live = fs.readFileSync("hooks/useLiveMarket.ts", "utf8");
const css = fs.readFileSync("app/globals.css", "utf8");

const checks: Array<[string, boolean]> = [
  ["one deliberate demo token", data.includes("TOKENS: Token[] = [DEMO_TOKEN]") && demo.includes('DEMO_MARKET_SLUG = "perphood-demo"')],
  ["one demo chart remains reachable from the restored terminal", (page.includes("redirect(`/market/${DEMO_MARKET_SLUG}`)") || page.includes("<TerminalHub />"))],
  ["single-market layout removes discovery rail", (screen.includes("tokens.length > 1") && screen.includes("single-market")) || (screen.includes("v37-market-shell") && !screen.includes("TerminalMarketRail"))],
  ["DEX-style time-window metrics", stats.includes('const WINDOWS: DemoWindow[] = ["5m", "1h", "6h", "24h"]') && stats.includes("Txns") && stats.includes("Traders")],
  ["market cap is the default chart scale", chart.includes('displayMode: "marketcap"') && chart.includes("chart-display-switch")],
  ["wallet intelligence chart markers", chart.includes("DEV BUY") && chart.includes("SMART") && chart.includes("SNIPER") && chart.includes("SHORT LIQS")],
  ["GMGN-style intelligence tabs", panel.includes('"Top traders"') && panel.includes('"Holders"') && panel.includes('"Token info"')],
  ["BattlePool and public execution tabs", panel.includes('"BattlePool"') && panel.includes('"Tape"') && panel.includes('"Positions"')],
  ["deterministic live demo replay", live.includes("buildDemoCandles") && live.includes("nextDemoTrade") && live.includes('isDemoMarket(market) ? "demo"')],
  ["research-derived single-market styling", (css.includes("PERPHOOD V36") || css.includes("PERPHOOD V37")) && css.includes("chart-wallet-markers")],
];

for (const [label, ok] of checks) {
  if (!ok) throw new Error(`V36 smoke failed: ${label}`);
  console.log(`PASS  ${label}`);
}
console.log(`V36 one-demo chart foundation smoke passed (${checks.length}/${checks.length}).`);
