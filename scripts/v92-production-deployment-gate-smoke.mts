import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const deploymentFiles = ["lib/v80-deployment.ts", "lib/v81-deployment.ts"];
for (const file of deploymentFiles) {
  const source = await readFile(resolve(process.cwd(), file), "utf8");
  if (/\.bindFactory\s*\(/.test(source)) {
    throw new Error(`${file} uses an untyped direct bindFactory call on an ethers BaseContract.`);
  }
  if (!source.includes('getFunction("bindFactory")')) {
    throw new Error(`${file} does not use the ethers v6-safe getFunction binding path.`);
  }
}
console.log("V92 production deployment gate passed: V80 and V81 use ABI-safe ethers v6 contract calls.");
