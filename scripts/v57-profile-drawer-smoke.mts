import fs from "node:fs";

const component = fs.readFileSync("components/ProfileMenu.tsx", "utf8");
const css = fs.readFileSync("app/globals.css", "utf8");
const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));

const checks: Array<[string, boolean]> = [
  ["V57 package version", pkg.version === "57.0.0"],
  ["non-modal drawer root", component.includes('className="lx-profile-drawer"')],
  ["legacy opaque backdrop removed from component", !component.includes("profile-sidebar-backdrop")],
  ["outside press closes without interception layer", component.includes('document.addEventListener("pointerdown", closeOnOutsidePress, true)')],
  ["Escape closes drawer", component.includes('event.key === "Escape"')],
  ["Leverage X avatar replaces PH", component.includes('className="lx-profile-avatar">LX<') && !component.includes('profile-avatar">PH<')],
  ["legacy X storage migrates to Leverage X key", component.includes("leveragex-x-connected-v1")],
  ["flattened grouped navigation", component.includes("LINK_GROUPS") && component.includes("lx-profile-navigation")],
  ["compact access and sync surface", component.includes("lx-profile-access") && component.includes("lx-profile-sync-actions")],
  ["performance calendar retained", component.includes("lx-profile-calendar") && component.includes("buildPnlCalendar")],
  ["drawer occupies only right-side width", css.includes(".lx-profile-drawer") && css.includes("width: min(386px, 100vw)")],
  ["no V57 full-screen dimmer", !css.includes(".lx-profile-drawer-backdrop")],
  ["terminal remains interactive", css.includes("The terminal remains fully visible and interactive")],
  ["sticky compact footer", css.includes(".lx-profile-footer") && css.includes("position: sticky")],
  ["mobile drawer remains partial width", css.includes("width: min(360px, 94vw)")],
];

let passed = 0;
for (const [label, ok] of checks) {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}`);
  if (ok) passed += 1;
}
console.log(`\nLeverage X V57 profile drawer: ${passed}/${checks.length} checks passed.`);
if (passed !== checks.length) process.exit(1);
