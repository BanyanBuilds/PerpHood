import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const hub = await readFile(new URL("../components/TerminalHub.tsx", import.meta.url), "utf8");
const panel = await readFile(new URL("../components/XLaunchFeedPanel.tsx", import.meta.url), "utf8");
const tracker = await readFile(new URL("../components/TerminalTrackerPanel.tsx", import.meta.url), "utf8");
const launch = await readFile(new URL("../components/LaunchPanel.tsx", import.meta.url), "utf8");
const route = await readFile(new URL("../app/api/x-launch-feed/route.ts", import.meta.url), "utf8");
const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

assert.match(hub, /x-launch-feed/);
assert.match(hub, /X Launch Feed/);
assert.doesNotMatch(tracker, /kind === "x-tracker"/);
assert.match(panel, /Posts → 5 tickers → Launcher/);
assert.match(panel, /PerpHood does not invent social posts/);
assert.match(panel, /onLaunchDraft/);
assert.match(launch, /Drafted from X Launch Feed/);
assert.match(route, /X_BEARER_TOKEN/);
assert.match(route, /api\.x\.com\/2\/tweets\/search\/recent/);
assert.match(css, /\.x-launch-feed-panel/);
console.log("V33 X Launch Feed UI smoke: PASS");
