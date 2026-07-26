import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [css, header, hub, profile, performance] = await Promise.all([
  readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  readFile(new URL("../components/Header.tsx", import.meta.url), "utf8"),
  readFile(new URL("../components/TerminalHub.tsx", import.meta.url), "utf8"),
  readFile(new URL("../components/ProfileMenu.tsx", import.meta.url), "utf8"),
  readFile(new URL("../components/TerminalPerformanceProvider.tsx", import.meta.url), "utf8"),
]);

assert.match(css, /--surface:\s*#333333/i);
assert.match(css, /ticker-search-columns/);
assert.match(css, /profile-sidebar/);
assert.match(css, /terminal-token-row\.is-og-token/);
assert.doesNotMatch(header, /desktop-nav/);
assert.doesNotMatch(header, /\["Launch"/);
assert.match(hub, /TerminalSearchOverlay/);
assert.match(hub, /360/);
assert.match(profile, /profile-sidebar/);
assert.match(performance, /RenderFpsMode = "auto" \| 60 \| 120 \| 144 \| 240 \| 360/);
assert.match(performance, /setAdaptiveCap/);

console.log("V25 terminal UI static smoke passed #333 theme, terminal-only header, dual ticker search, OG rail, profile sidebar, and adaptive 360 FPS mode.");
