import { readFileSync } from "node:fs";

const source = readFileSync("lib/v81-deployment.ts", "utf8");
const required = [
  'contract.getFunction(functionName)()',
  'locker.getFunction("bindFactory")',
  'call(locker, "owner")',
  'call(factory, "launchesOpen")',
  'call(factory, "swapRouter02")',
];
for (const token of required) {
  if (!source.includes(token)) throw new Error(`Missing V93 contract type-safety primitive: ${token}`);
}
const forbidden = [
  "locker.owner()", "locker.factory()", "locker.uniswapV3Factory()",
  "factory.owner()", "factory.liquidityLocker()", "factory.launchesOpen()",
  "factory.swapRouter02()",
];
for (const token of forbidden) {
  if (source.includes(token)) throw new Error(`Unsafe dynamically typed Ethers call remains: ${token}`);
}
console.log("V93 Ethers contract type-safety smoke test passed.");
