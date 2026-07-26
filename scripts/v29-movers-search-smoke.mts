import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const hub = await readFile(resolve(root, "components/TerminalHub.tsx"), "utf8");
const search = await readFile(resolve(root, "components/TerminalSearchOverlay.tsx"), "utf8");
const css = await readFile(resolve(root, "app/globals.css"), "utf8");
const page = await readFile(resolve(root, "app/page.tsx"), "utf8");
const header = await readFile(resolve(root, "components/Header.tsx"), "utf8");

function requireText(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

requireText(hub.includes('workspaceView === "markets"'), "Markets workspace switch is missing");
requireText(hub.includes('workspaceView === "movers"'), "Movers workspace switch is missing");
requireText(hub.includes('>Markets</button>'), "Markets tab is missing");
requireText(hub.includes('>Movers</button>'), "Movers tab is missing");
requireText(hub.includes('"Movers", "Largest live price moves') || hub.includes('"Movers", "Real-time momentum'), "Movers ranking column is missing");
requireText(hub.includes('"Most Liked", "Community favorites'), "Most Liked ranking column is missing");
requireText(hub.includes('"Highest Market Cap", "Every active coin'), "Highest Market Cap column is missing");
requireText(hub.includes('categorySettings[kind]'), "Movers quick-buy amounts are not independently configurable");
requireText(hub.includes('likesFor(token'), "Movers likes are not connected to the token rows");
requireText(!hub.includes('<strong>Trenches</strong>'), "The duplicate Trenches heading remains");
requireText(!hub.includes('<strong>Terminal</strong>'), "The duplicate Terminal heading remains");
requireText(!hub.includes('3 columns</button>'), "Dead three-column control remains");
requireText(!hub.includes('>Customize</button>'), "Dead customize control remains");
requireText(!page.includes('<Header'), "Primary PerpHood route still renders a duplicate site header");
requireText(!header.includes('ROBINHOOD CHAIN TERMINAL'), "Legacy terminal tagline remains in the shared header");
requireText(search.includes('ticker-search-backdrop'), "Dual ticker search overlay is missing");
requireText(css.includes('place-items: center !important'), "Search overlay is not true center-screen");
requireText(css.includes('background: rgba(4,5,4,.34) !important'), "Search backdrop is not the approved lighter shade");
requireText(css.includes('backdrop-filter: blur(2px)'), "Search backdrop blur is too strong or missing");
requireText(css.includes('max-width: 330px !important'), "Command-bar search is not compact");
requireText(css.includes('.movers-workspace'), "Movers workspace styles are missing");
requireText(css.includes('.mover-live-rank'), "Movers live ranking styles are missing");

console.log("V29 integrated Movers + centered search smoke passed.");
