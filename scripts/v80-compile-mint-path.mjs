import fs from "node:fs";
import path from "node:path";
import solc from "solc";

const root = process.cwd();
const sourceDir = path.join(root, "contracts", "mint-path-src");
const entry = "LeverageXLaunchFactoryV70.sol";
const input = {
  language: "Solidity",
  sources: {
    [entry]: { content: fs.readFileSync(path.join(sourceDir, entry), "utf8") },
    "BattleCurveMathV24.sol": { content: fs.readFileSync(path.join(sourceDir, "BattleCurveMathV24.sol"), "utf8") },
  },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    viaIR: true,
    metadata: { bytecodeHash: "none", appendCBOR: false },
    outputSelection: { "*": { "*": ["abi", "evm.bytecode.object", "evm.deployedBytecode.object"] } },
  },
};
const output = JSON.parse(solc.compile(JSON.stringify(input), {
  import: (name) => {
    const resolved = path.join(sourceDir, path.basename(name));
    return fs.existsSync(resolved) ? { contents: fs.readFileSync(resolved, "utf8") } : { error: `Missing import: ${name}` };
  },
}));
const errors = (output.errors ?? []).filter((e) => e.severity === "error");
if (errors.length) {
  console.error(errors.map((e) => e.formattedMessage).join("\n"));
  process.exit(1);
}
const contracts = output.contracts?.[entry];
if (!contracts) throw new Error("Mint-path compiler returned no contracts.");
const wanted = ["LeverageXPermanentLiquidityLockerV65", "LeverageXLaunchFactoryV65"];
const artifact = { compiler: solc.version(), source: entry, contracts: {} };
for (const name of wanted) {
  const item = contracts[name];
  if (!item?.evm?.bytecode?.object) throw new Error(`Missing bytecode for ${name}`);
  artifact.contracts[name] = {
    abi: item.abi,
    bytecode: `0x${item.evm.bytecode.object}`,
    deployedBytecode: `0x${item.evm.deployedBytecode.object}`,
  };
}
fs.mkdirSync(path.join(root, "artifacts", "v80"), { recursive: true });
fs.writeFileSync(path.join(root, "artifacts", "v80", "mint-path.json"), JSON.stringify(artifact, null, 2));
console.log(`V80 mint-path artifact compiled with ${artifact.compiler}`);
