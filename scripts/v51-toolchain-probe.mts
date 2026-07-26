import { spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

function probe(command: string, args: string[]) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  return {
    available: !result.error && result.status === 0,
    status: result.status,
    version: (result.stdout || result.stderr || result.error?.message || "").trim().split("\n")[0],
  };
}

const report = {
  generatedAt: new Date().toISOString(),
  forge: probe("forge", ["--version"]),
  anvil: probe("anvil", ["--version"]),
  cast: probe("cast", ["--version"]),
  node: process.version,
  requiredForCompiledCampaign: ["forge", "anvil", "cast"],
};
const path = resolve("public/local-chain/v51-toolchain.json");
await mkdir(dirname(path), { recursive: true });
await writeFile(path, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
