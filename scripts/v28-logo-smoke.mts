import { existsSync, readFileSync, statSync } from "node:fs";

const required = [
  "public/perphood-logo.png",
  "public/favicon.ico",
  "app/icon.png",
  "app/apple-icon.png",
];
for (const file of required) {
  if (!existsSync(file)) throw new Error(`Missing V28 logo asset: ${file}`);
  if (statSync(file).size < 1_000) throw new Error(`Logo asset is unexpectedly small: ${file}`);
}
const iconComponent = readFileSync("components/icons.tsx", "utf8");
if (!iconComponent.includes('/perphood-logo.png')) throw new Error("BrandMark is not using the official V28 logo.");
if (iconComponent.includes("Feather")) throw new Error("Legacy feather mark still exists in BrandMark.");
const css = readFileSync("app/globals.css", "utf8");
if (!css.includes("V28 — official gold PerpHood mark")) throw new Error("V28 logo styling is missing.");
if (!css.includes("width: 34px !important")) throw new Error("Header logo is not enlarged to company-mark scale.");
console.log("V28 official gold logo assets and header integration passed.");
