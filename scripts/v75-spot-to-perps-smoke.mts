import { readFileSync } from "node:fs";

const required = [
  "scripts/v75-activate-first-perps-market.ps1",
  "START_V75_ACTIVATE_FIRST_PERPS_MARKET.cmd",
  "V75_SPOT_TO_PERPS_ACTIVATION.md",
];
for (const path of required) {
  const text = readFileSync(path, "utf8");
  if (!text.trim()) throw new Error(`V75 required file is empty: ${path}`);
}
const script = readFileSync(required[0], "utf8");
const invariants = [
  "liquidity()(uint128)",
  "slot0()(uint160,int24,uint16,uint16,uint16,uint8,bool)",
  "maximumLeverage = 20",
  "creatorWalletPermanentlyBlocked = $true",
  "weakHeuristicAccusationsAllowed = $false",
  "eligible-for-perps-engine",
];
for (const invariant of invariants) {
  if (!script.includes(invariant)) throw new Error(`V75 invariant missing: ${invariant}`);
}
console.log("V75 spot-to-perps activation smoke passed.");
