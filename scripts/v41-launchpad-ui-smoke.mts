import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (path: string) => readFile(new URL(path, root), "utf8");
const [launchPanel, consoleComponent, provider, styles, adminPage, quoteRoute, schema] = await Promise.all([
  read("components/LaunchPanel.tsx"),
  read("components/LaunchpadTestConsole.tsx"),
  read("components/MarketProvider.tsx"),
  read("app/globals.css"),
  read("app/admin/launchpad/page.tsx"),
  read("app/api/launchpad/quote/route.ts"),
  read("supabase/schema.sql"),
]);

const checks: Array<[string, boolean]> = [
  ["three-step launch flow", launchPanel.includes('type LaunchStep = "identity" | "funding" | "review"')],
  ["total spend includes gas", launchPanel.includes("Total launch spend") && launchPanel.includes("Estimated gas reserve")],
  ["creator buy remainder shown", launchPanel.includes("Creator curve buy")],
  ["migration targets selectable", launchPanel.includes("LAUNCHPAD_TARGET_OPTIONS_USD")],
  ["creator perps restriction disclosed", launchPanel.includes("Creator wallet cannot long or short")],
  ["test console lifecycle actions", consoleComponent.includes("Advance to target") && consoleComponent.includes("Migrate safely")],
  ["migration gates rendered", consoleComponent.includes("snapshot.gates.map")],
  ["provider persists custom launches with demo", provider.includes("const reviewTokens = [...TOKENS, ...normalizedCustom]")],
  ["provider reserves gas before curve buy", provider.includes("quoteLaunchSpend") && provider.includes("launchQuote.creatorBuyEth")],
  ["admin route exists", adminPage.includes("LaunchpadTestConsole")],
  ["quote API exists", quoteRoute.includes("estimateMigrationTarget")],
  ["launchpad schema exists", schema.includes("create table if not exists public.launchpad_markets")],
  ["responsive launchpad styles", styles.includes(".v41-launchpad") && styles.includes(".v41-console-grid")],
];

for (const [label, passed] of checks) assert.equal(passed, true, label);
console.log(`V41 launchpad UI smoke passed (${checks.length}/${checks.length}).`);
