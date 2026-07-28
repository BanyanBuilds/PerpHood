import fs from "node:fs";
const required = [
  "lib/v81-deployment.ts",
  "app/api/admin/deploy-launch-contracts/route.ts",
  "app/admin/deploy-launch-contracts/page.tsx",
  "contracts/mint-path-src/LeverageXLaunchFactoryV70.sol",
  ".gitignore",
  "PUSH_TO_GITHUB.cmd",
];
for (const file of required) if (!fs.existsSync(file)) throw new Error(`Missing ${file}`);
const lib = fs.readFileSync("lib/v81-deployment.ts", "utf8");
for (const text of ["RH_CHAIN_ID = 4663n", "verifyDeployment", "launchesClosed", "vercelEnvironment"]) if (!lib.includes(text)) throw new Error(`Missing ${text}`);
const gitignore = fs.readFileSync(".gitignore", "utf8");
for (const text of [".env", ".vercel", "broadcast/"]) if (!gitignore.includes(text)) throw new Error(`gitignore missing ${text}`);
console.log("V81 secure mainnet deployment smoke test passed.");
