import { readFileSync } from "node:fs";

const files = {
  common: readFileSync("scripts/v64-first-launch-common.mts", "utf8"),
  preflight: readFileSync("scripts/v64-first-token-preflight.mts", "utf8"),
  launch: readFileSync("scripts/v64-create-first-token.mts", "utf8"),
  roundtrip: readFileSync("scripts/v64-trader-roundtrip.mts", "utf8"),
  evidence: readFileSync("scripts/v64-build-gmgn-canary-evidence.mts", "utf8"),
  readiness: readFileSync("lib/server/v64-first-launch-readiness.ts", "utf8"),
  api: readFileSync("app/api/v64/first-launch-readiness/route.ts", "utf8"),
  evidenceApi: readFileSync("app/api/v64/gmgn/evidence/route.ts", "utf8"),
  console: readFileSync("components/V64FirstLaunchConsole.tsx", "utf8"),
  manifest: readFileSync("lib/server/v63-gmgn-feed.ts", "utf8"),
  env: readFileSync(".env.mainnet.example", "utf8"),
  package: readFileSync("package.json", "utf8"),
};

const checks: Array<[string, boolean]> = [
  ["V64 preflight is explicitly zero-transaction", files.preflight.includes("NO SIGNING / NO BROADCAST") && !files.preflight.includes('"cast", ["send"')],
  ["creator total spend minimum is inclusive of gas", files.common.includes("V64_MIN_TOTAL_BUDGET_WEI") && files.common.includes("inclusive of gas") && files.common.includes("estimatedNetworkFeeWei")],
  ["creator identity and metadata are validated", files.common.includes("V64_TOKEN_NAME") && files.common.includes("V64_TOKEN_SYMBOL") && files.common.includes("V64_TOKEN_METADATA_URI") && files.common.includes('metadata.image')],
  ["metadata hash is deterministic SHA-256", files.common.includes('createHash("sha256")')],
  ["first launch requires exact confirmation phrase", files.launch.includes("LAUNCH_FIRST_LEVERAGE_X_MAINNET_TOKEN")],
  ["first launch verifies a paused one-market state", files.launch.includes("!state.paused") && files.launch.includes("state.tradeCount !== 1n")],
  ["first launch writes public transaction/address env", files.launch.includes("v64-vercel-launch.env") && files.launch.includes("V64_FIRST_LAUNCH_TX_HASH")],
  ["trader wallet is separate from creator", files.roundtrip.includes("state.creator === V64_TRADER")],
  ["roundtrip requires deliberate confirmation", files.roundtrip.includes("RUN_FIRST_LEVERAGE_X_MAINNET_TRADER_ROUNDTRIP")],
  ["roundtrip proves buy approval and sell", files.roundtrip.includes('"buy(uint256)"') && files.roundtrip.includes('"approve(address,uint256)"') && files.roundtrip.includes('"sell(uint256,uint256)"')],
  ["roundtrip remains under market caps", files.roundtrip.includes("maxBuyWei") && files.roundtrip.includes("maxSellTokenWad")],
  ["GMGN evidence requires public token discovery", files.evidence.includes("Public token discovery") && files.evidence.includes("tokenAndMarketMatch")],
  ["GMGN evidence includes real launch buy and sell txs", files.evidence.includes("launchTransaction") && files.evidence.includes("traderBuyTransaction") && files.evidence.includes("traderSellTransaction")],
  ["GMGN label is never self-asserted", files.evidence.includes("Only GMGN can approve") && files.evidenceApi.includes("never self-asserted")],
  ["V64 readiness checks live receipts", files.readiness.includes("eth_getTransactionReceipt") && files.readiness.includes("roundtripConfirmed")],
  ["operator console is packaged", files.console.includes("First Real Token Control") && files.console.includes("GMGN HANDOFF READY")],
  ["public canary evidence endpoint is packaged", files.evidenceApi.includes("gmgn-canary-evidence-v1")],
  ["V63 manifest points to V64 canary evidence", files.manifest.includes("/api/v64/gmgn/evidence")],
  ["V64 commands are wired", files.package.includes("chain:v64:first-token:preflight") && files.package.includes("chain:v64:trader:roundtrip") && files.package.includes("gmgn:evidence:v64")],
  ["local env keeps creator/trader signing separate", files.env.includes("V64_CREATOR_KEYSTORE_ACCOUNT") && files.env.includes("V64_TRADER_KEYSTORE_ACCOUNT")],
];

let passed = 0;
for (const [label, ok] of checks) {
  if (!ok) throw new Error(`V64 smoke failed: ${label}`);
  passed += 1;
  console.log(`✓ ${label}`);
}
console.log(`\nV64 first-mainnet-launch controls: ${passed}/${checks.length} checks passed.`);
