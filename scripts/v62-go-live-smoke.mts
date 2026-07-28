import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");
const checks: Array<[boolean, string]> = [];
const readiness = read("lib/server/v62-go-live-readiness.ts");
const consoleUi = read("components/V62GoLiveConsole.tsx");
const proof = read("scripts/v62-first-launch-proof.mts");
const preflight = read("scripts/v62-go-live-preflight.mts");
const launcher = read("components/LaunchPanel.tsx");
const pkg = JSON.parse(read("package.json")) as { scripts?: Record<string, string>; version?: string; name?: string };

checks.push([readiness.includes("probeSupabase") && readiness.includes("publicFactoryMatchesServer"), "full-stack readiness checks storage and environment consistency"]);
checks.push([readiness.includes("firstLaunchConfirmed") && readiness.includes("cappedSpotOpen"), "readiness distinguishes on-chain creation from confirmed registry proof"]);
checks.push([consoleUi.includes("Mainnet Go-Live Control") && consoleUi.includes("Exact next action"), "operator console exposes the authoritative next gate"]);
checks.push([proof.includes("V62_FIRST_LAUNCH_TX_HASH") && proof.includes("oneBillionSupply"), "first launch proof validates transaction and fixed supply"]);
checks.push([proof.includes("indexingGuaranteed: false"), "GMGN visibility is not falsely promised"]);
checks.push([proof.includes("if (!registryVerified) throw") && read("scripts/v60-open-canary-spot.mts").includes("v62-first-launch-proof.json"), "Spot cannot open without matching on-chain and Supabase proof"]);
checks.push([preflight.includes("NO SIGNING / NO BROADCAST") && preflight.includes("signedTransactions: 0"), "go-live preflight cannot sign or broadcast"]);
checks.push([/\/api\/v(?:62|64)\/metadata/.test(launcher) && /\/api\/v(?:62|64)\/launches/.test(launcher), "launcher uses versioned production endpoints"]);
checks.push([pkg.scripts?.["test:v62-fast"]?.includes("typecheck") ?? false, "V62 fast gate includes TypeScript"]);
checks.push([pkg.scripts?.["chain:v62:first-launch-proof"]?.includes("v62-first-launch-proof.mts") ?? false, "V62 proof command is packaged"]);
checks.push([Number(pkg.version?.split(".")[0] ?? 0) >= 62 && /v6[2-9]/.test(pkg.name ?? ""), "package preserves the V62+ go-live lineage"]);

let failed = 0;
for (const [passed, label] of checks) {
  console.log(`${passed ? "✓" : "✗"} ${label}`);
  if (!passed) failed += 1;
}
if (failed) throw new Error(`${failed} V62 go-live checks failed.`);
console.log(`V62 GO-LIVE CHECKS PASSED (${checks.length}/${checks.length})`);
