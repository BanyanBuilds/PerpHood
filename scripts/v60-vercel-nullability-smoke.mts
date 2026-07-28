import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const files = [
  "components/V59MainnetConsole.tsx",
  "components/V60CanaryConsole.tsx",
];

let checks = 0;
for (const relative of files) {
  const source = fs.readFileSync(path.join(root, relative), "utf8");
  const unsafeNullableTernary = /data\?\.[^\n]*=== null\s*\?[^\n]*:\s*data\./g;
  if (unsafeNullableTernary.test(source)) {
    throw new Error(`${relative} still contains an unsafe nullable ternary`);
  }
  checks += 1;
}

const v59 = fs.readFileSync(path.join(root, files[0]), "utf8");
const v60 = fs.readFileSync(path.join(root, files[1]), "utf8");
for (const token of ["globalTradingPaused", "newMarketsPaused"]) {
  if (!v59.includes(`const ${token} = data?.factory.${token} ?? null;`)) {
    throw new Error(`V59 missing normalized ${token}`);
  }
  checks += 1;
}
for (const token of ["marketPaused", "newMarketsPaused", "nextLocalCommand"]) {
  if (!v60.includes(`const ${token}`)) {
    throw new Error(`V60 missing normalized ${token}`);
  }
  checks += 1;
}

console.log(`V60 Vercel nullability smoke: ${checks}/${checks} checks passed`);
