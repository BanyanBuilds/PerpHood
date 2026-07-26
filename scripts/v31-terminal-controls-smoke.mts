import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DEFAULT_CATEGORY_SETTINGS, applyFeePreset } from "../lib/terminal-settings.ts";

const hub = await readFile(new URL("../components/TerminalHub.tsx", import.meta.url), "utf8");
const sidecar = await readFile(new URL("../components/TerminalSidecar.tsx", import.meta.url), "utf8");
const strip = await readFile(new URL("../components/TerminalPositionWatchStrip.tsx", import.meta.url), "utf8");
const performance = await readFile(new URL("../components/TerminalPerformanceProvider.tsx", import.meta.url), "utf8");
const outside = await readFile(new URL("../components/useOutsideDismiss.ts", import.meta.url), "utf8");

assert.deepEqual(Object.keys(DEFAULT_CATEGORY_SETTINGS).sort(), ["cooking", "liked", "market-cap", "migrated", "movers", "new"]);
assert.equal(DEFAULT_CATEGORY_SETTINGS.new.quickBuyEth, 0.01);
assert.equal(DEFAULT_CATEGORY_SETTINGS.migrated.quickBuyEth, 0.03);
assert.equal(applyFeePreset(DEFAULT_CATEGORY_SETTINGS.new, "economy").buyPriorityFeeEth, 0.00005);
assert.match(hub, /TerminalCategorySettings/);
assert.match(hub, /bottomDockSettings/);
assert.match(hub, /floatingPanels/);
assert.match(hub, /panelPlacement/);
assert.match(sidecar, /Move to left dock/);
assert.match(sidecar, /Move to right dock/);
assert.match(sidecar, /Detach panel/);
assert.match(strip, /Positions \+ watchlist strip/);
assert.match(outside, /mousedown/);
assert.match(performance, /mode === "auto" \? Math\.min\(requestedFps, displayHz, cap\) : requestedFps/);
console.log("V31 terminal settings, strip, sidecar, outside-dismiss, and manual 360 FPS smoke passed.");
