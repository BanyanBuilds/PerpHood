import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (path: string) => readFile(new URL(path, root), "utf8");
const [hub, sidecar, styles] = await Promise.all([
  read("components/TerminalHub.tsx"),
  read("components/TerminalSidecar.tsx"),
  read("app/globals.css"),
]);

const checks: Array<[boolean, string]> = [
  [hub.includes("const MAX_LEFT_DOCK_PANELS = 3"), "left dock explicitly supports three sidecars"],
  [hub.includes('data-count={leftPanels.length}'), "left dock exposes its active slot count"],
  [hub.includes("leftPanels.map((panel, index) => renderDockPanel(panel, \"left\", index))"), "all three left panels render independently"],
  [hub.includes("occupiedLeftSlots >= MAX_LEFT_DOCK_PANELS"), "a fourth panel cannot silently crush the three visible slots"],
  [hub.includes('[kind]: "floating"'), "a fourth default-left tool opens safely as a floating panel"],
  [hub.includes("openPanels?: DrawerKind[]"), "open sidecars are part of the saved workspace"],
  [hub.includes("openPanels, stripSettings"), "open sidecars persist with the terminal layout"],
  [sidecar.includes("dockSlot?: number"), "sidecars understand their dock slot"],
  [sidecar.includes("left dock · ${dockSlot}/${dockCapacity}"), "left sidecars display slot occupancy"],
  [styles.includes('.terminal-dock-stack.left[data-count="3"]'), "three-panel layout has a dedicated grid"],
  [styles.includes("repeat(3, minmax(0, 1fr))"), "three panels share the visible left rail equally"],
  [styles.includes("overscroll-behavior: contain"), "each sidecar scroll remains independent"],
  [!hub.includes('"quick-trade"'), "the multi-sidecar workspace does not restore a trading sidecar"],
];
for (const [passed, label] of checks) assert.equal(passed, true, label);
console.log(`V48.2 three-left-sidecar smoke passed (${checks.length}/${checks.length}).`);
