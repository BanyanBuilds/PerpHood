import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const strict = process.argv.includes("--strict");
type GateResult = {
  id: string;
  label: string;
  status: "passed" | "blocked" | "failed" | "skipped";
  command?: string;
  detail: string;
};
const results: GateResult[] = [];

function executable(command: string) {
  return process.platform === "win32" && command === "npm" ? "npm.cmd" : command;
}

function commandAvailable(command: string, args = ["--version"]) {
  const result = spawnSync(executable(command), args, { encoding: "utf8", stdio: "pipe" });
  return !result.error && result.status === 0;
}

function runGate(id: string, label: string, command: string, args: string[], required = true) {
  const rendered = [command, ...args].join(" ");
  const result = spawnSync(executable(command), args, {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: "pipe",
    env: process.env,
  });
  if (result.error && (result.error as NodeJS.ErrnoException).code === "ENOENT") {
    results.push({ id, label, status: required ? "blocked" : "skipped", command: rendered, detail: `${command} is not installed or not in PATH.` });
    return;
  }
  if (result.status !== 0) {
    const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim().slice(-4_000);
    results.push({ id, label, status: required ? "failed" : "skipped", command: rendered, detail: output || `Exited with code ${result.status}.` });
    return;
  }
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim().slice(-2_000);
  results.push({ id, label, status: "passed", command: rendered, detail: output || "Passed." });
}

const nodeMajor = Number(process.versions.node.split(".")[0]);
results.push({
  id: "node",
  label: "Node.js 22+",
  status: nodeMajor >= 22 ? "passed" : "blocked",
  detail: `Detected Node.js ${process.versions.node}.`,
});
results.push({
  id: "npm",
  label: "npm available",
  status: commandAvailable("npm") ? "passed" : "blocked",
  detail: commandAvailable("npm") ? "npm is available." : "Install Node.js with npm.",
});

runGate("v63-static", "GMGN compatibility controls", "node", ["--experimental-strip-types", "scripts/v63-gmgn-compatibility-smoke.mts"]);
runGate("v64-static", "First-mainnet-launch controls", "node", ["--experimental-strip-types", "scripts/v64-first-mainnet-launch-smoke.mts"]);
runGate("v65-static", "Canonical live-pool controls", "node", ["--experimental-strip-types", "scripts/v65-gmgn-live-pool-smoke.mts"]);
runGate("v66-static", "Mainnet execution controls", "node", ["--experimental-strip-types", "scripts/v66-mainnet-execution-smoke.mts"]);
runGate("syntax", "TypeScript syntax smoke", "node", ["--experimental-strip-types", "scripts/typescript-syntax-smoke.mts"]);

const dependenciesReady = existsSync(resolve("node_modules", "typescript", "bin", "tsc"))
  && existsSync(resolve("node_modules", "next", "dist", "bin", "next"));
if (dependenciesReady) {
  runGate("typecheck", "TypeScript typecheck", "npm", ["run", "typecheck"]);
  runGate("next-build", "Next.js production build", "npm", ["run", "build"]);
} else {
  results.push({ id: "dependencies", label: "Node dependencies", status: "blocked", detail: "Run npm ci successfully before typecheck and production build." });
}

const forgeReady = commandAvailable("forge");
const castReady = commandAvailable("cast");
results.push({ id: "forge", label: "Foundry Forge", status: forgeReady ? "passed" : "blocked", detail: forgeReady ? "forge is available." : "Install Foundry so forge is available in PATH." });
results.push({ id: "cast", label: "Foundry Cast", status: castReady ? "passed" : "blocked", detail: castReady ? "cast is available." : "Install Foundry so cast is available in PATH." });
if (forgeReady) {
  runGate("forge-build", "Solidity compile and size report", "forge", ["build", "--sizes"]);
  runGate("forge-test", "V65 contract tests", "forge", ["test", "--match-path", "contracts/test/LeverageXLaunchFactoryV65.t.sol", "-vvv"]);
}

const rpcConfigured = Boolean(
  process.env.ROBINHOOD_MAINNET_RPC_URL
  ?? process.env.ROBINHOOD_CHAIN_RPC_URL
  ?? process.env.V48_RPC_URLS?.split(",").map((value) => value.trim()).find(Boolean),
);
if (rpcConfigured && forgeReady && castReady) {
  runGate("mainnet-preflight", "Zero-transaction Robinhood mainnet preflight", "node", ["--experimental-strip-types", "scripts/v65-mainnet-preflight.mts"]);
} else {
  const missing = [!rpcConfigured && "private Robinhood mainnet RPC", !forgeReady && "forge", !castReady && "cast"].filter(Boolean).join(", ");
  results.push({ id: "mainnet-preflight", label: "Zero-transaction Robinhood mainnet preflight", status: "blocked", detail: `Missing: ${missing}. No transaction was attempted.` });
}

const blockers = results.filter((result) => result.status === "blocked" || result.status === "failed");
const report = {
  release: "Leverage X V66",
  contractCandidate: "LeverageXLaunchFactoryV65",
  generatedAt: new Date().toISOString(),
  safeToDeployClosed: blockers.length === 0,
  transactionBroadcast: false,
  summary: {
    passed: results.filter((result) => result.status === "passed").length,
    blocked: results.filter((result) => result.status === "blocked").length,
    failed: results.filter((result) => result.status === "failed").length,
    skipped: results.filter((result) => result.status === "skipped").length,
  },
  results,
};
mkdirSync(resolve("deployments"), { recursive: true });
writeFileSync(resolve("deployments", "v66-mainnet-execution-gate.json"), `${JSON.stringify(report, null, 2)}\n`);

console.log("\nLeverage X V66 — Mainnet Execution Gate");
for (const result of results) {
  const icon = result.status === "passed" ? "PASS" : result.status.toUpperCase();
  console.log(`${icon.padEnd(7)} ${result.label}`);
}
console.log(`\nPassed ${report.summary.passed}; blocked ${report.summary.blocked}; failed ${report.summary.failed}.`);
console.log("No transaction was signed or broadcast. Report: deployments/v66-mainnet-execution-gate.json");
if (strict && blockers.length > 0) process.exitCode = 1;
