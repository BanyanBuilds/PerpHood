import fs from "node:fs";
const required = [
  ".gitignore",
  "scripts/v80-compile-mint-path.mjs",
  "lib/v80-deployment.ts",
  "app/api/admin/deploy-launch-contracts/route.ts",
  "app/admin/deploy-launch-contracts/page.tsx",
];
for (const file of required) if (!fs.existsSync(file)) throw new Error(`Missing ${file}`);
const ignore = fs.readFileSync(".gitignore", "utf8");
for (const pattern of [".env.local", ".vercel/", "*.key"]) if (!ignore.includes(pattern)) throw new Error(`Missing gitignore protection: ${pattern}`);
const route = fs.readFileSync("app/api/admin/deploy-launch-contracts/route.ts", "utf8");
if (!route.includes("LEVERAGEX_DEPLOY_ADMIN_TOKEN") || !route.includes("DEPLOY-RH-4663")) throw new Error("Deployment endpoint safety gate missing.");
const lib = fs.readFileSync("lib/v80-deployment.ts", "utf8");
if (lib.includes("NEXT_PUBLIC_LEVERAGEX_DEPLOYER_PRIVATE_KEY")) throw new Error("Private key was exposed as public env.");
console.log("V80 secure deployment smoke passed.");
