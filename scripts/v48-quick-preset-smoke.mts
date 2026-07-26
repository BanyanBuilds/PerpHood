import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  DEFAULT_CATEGORY_SETTINGS,
  getQuickPerpPreset,
  normalizeCategorySettings,
} from "../lib/terminal-settings.ts";

const root = new URL("../", import.meta.url);
const read = (path: string) => readFile(new URL(path, root), "utf8");
const [hub, row, settings, styles] = await Promise.all([
  read("components/TerminalHub.tsx"),
  read("components/TerminalTokenRow.tsx"),
  read("components/TerminalCategorySettings.tsx"),
  read("app/globals.css"),
]);

for (const [category, profile] of Object.entries(DEFAULT_CATEGORY_SETTINGS)) {
  assert.equal(profile.quickLongEnabled, false, `${category} Quick Long must default disabled`);
  assert.equal(profile.quickShortEnabled, false, `${category} Quick Short must default disabled`);
  assert.ok(profile.quickLongCollateralEth > 0, `${category} Quick Long needs a saved amount field`);
  assert.ok(profile.quickShortCollateralEth > 0, `${category} Quick Short needs a saved amount field`);
}

const configured = normalizeCategorySettings({
  ...DEFAULT_CATEGORY_SETTINGS.movers,
  quickLongEnabled: true,
  quickLongCollateralEth: 1,
  quickLongLeverage: 10,
  quickShortEnabled: true,
  quickShortCollateralEth: 0.5,
  quickShortLeverage: 20,
});
assert.deepEqual(getQuickPerpPreset(configured, "long"), { enabled: true, collateralEth: 1, leverage: 10 });
assert.deepEqual(getQuickPerpPreset(configured, "short"), { enabled: true, collateralEth: 0.5, leverage: 20 });

const checks: Array<[boolean, string]> = [
  [!hub.includes('"quick-trade"'), "Markets/Movers no longer register a quick-trade sidecar"],
  [!hub.includes('import { TradePanel }'), "TerminalHub no longer imports the trade sidecar"],
  [hub.includes("await openPosition(token.slug, side, preset.leverage, preset.collateralEth"), "Long/Short execute their exact saved preset in place"],
  [hub.includes("if (!preset.enabled)"), "unset presets are rejected before execution"],
  [hub.includes("stayed on ${workspaceView"), "spot Quick Buy remains on the current workspace"],
  [hub.includes('perphood-terminal-layout-v15'), "new independent presets persist in the saved layout"],
  [row.includes('disabled={!quickLongPreset.enabled || quickActionsLocked}'), "Quick Long button is disabled until configured"],
  [row.includes('disabled={!quickShortPreset.enabled || quickActionsLocked}'), "Quick Short button is disabled until configured"],
  [row.includes('`${quickLongPreset.leverage}× LONG`'), "Quick Long button exposes leverage"],
  [row.includes('`${quickShortPreset.leverage}× SHORT`'), "Quick Short button exposes leverage"],
  [settings.includes('side="long"') && settings.includes('side="short"'), "settings expose separate Long and Short preset editors"],
  [settings.includes("Not configured — row action disabled"), "settings explain the disabled behavior"],
  [styles.includes(".terminal-row-open-key.preset-disabled"), "disabled preset styling exists"],
];
for (const [passed, label] of checks) assert.equal(passed, true, label);

console.log(`V48.1 in-place Quick Buy/Long/Short preset smoke passed (${checks.length}/${checks.length}).`);
