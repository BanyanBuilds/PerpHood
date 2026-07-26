import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const hub = readFileSync(new URL("../components/TerminalHub.tsx", import.meta.url), "utf8");
const row = readFileSync(new URL("../components/TerminalTokenRow.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

assert.match(hub, /rankMovers\(/);
assert.match(hub, /Score refresh · 1s/);
assert.match(hub, /Fast participation beats one-wallet volume/);
assert.match(hub, /15s 45% · 1m 35% · 5m 20%/);
assert.match(row, /terminal-mover-score/);
assert.match(row, /moverScore\.reasons/);
assert.match(css, /\.movers-algo-popover/);
assert.match(css, /\.terminal-token-row\.has-mover-score/);

console.log("V30 movers UI smoke: PASS");
