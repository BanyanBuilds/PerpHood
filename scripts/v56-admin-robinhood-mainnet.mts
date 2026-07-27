import { spawnSync } from "node:child_process";

const RPC = process.env.ROBINHOOD_MAINNET_RPC_URL;
const FACTORY = process.env.V56_MAINNET_FACTORY_ADDRESS ?? process.env.NEXT_PUBLIC_V56_MAINNET_FACTORY_ADDRESS;
const EXPLORER = "https://robinhoodchain.blockscout.com";
const EXPECTED_CHAIN_ID = 4_663;
const command = process.argv[2] ?? "status";
const args = process.argv.slice(3);

if (!RPC) throw new Error("Set ROBINHOOD_MAINNET_RPC_URL.");
if (!FACTORY || !/^0x[0-9a-fA-F]{40}$/.test(FACTORY)) throw new Error("Set V56_MAINNET_FACTORY_ADDRESS to the deployed V56 factory.");

function run(program: string, values: string[], secrets: string[] = []) {
  const result = spawnSync(program, values, { cwd: process.cwd(), encoding: "utf8", stdio: "pipe", env: process.env });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    let detail = `${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim();
    for (const secret of secrets) detail = detail.split(secret).join("[REDACTED]");
    throw new Error(`${program} ${values[0] ?? ""} failed.${detail ? `\n${detail}` : ""}`);
  }
  return String(result.stdout ?? "").trim();
}

function parseUnits(value: string, decimals = 18) {
  if (!/^\d+(?:\.\d+)?$/.test(value)) throw new Error(`Invalid decimal amount: ${value}`);
  const [whole, fraction = ""] = value.split(".");
  if (fraction.length > decimals) throw new Error(`Amount has more than ${decimals} decimal places.`);
  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, "0") || "0");
}

function boolArg(value: string) {
  if (value !== "true" && value !== "false") throw new Error("Boolean argument must be true or false.");
  return value;
}

const chainId = Number(run("cast", ["chain-id", "--rpc-url", RPC]));
if (chainId !== EXPECTED_CHAIN_ID) throw new Error(`Wrong network: ${chainId}; expected ${EXPECTED_CHAIN_ID}.`);

function read(signature: string, ...params: string[]) {
  return run("cast", ["call", FACTORY!, signature, ...params, "--rpc-url", RPC!]);
}

function printStatus() {
  const mode = Number(read("launchMode()(uint8)"));
  const labels = ["closed", "allowlist", "public"];
  console.log(`Factory: ${FACTORY}`);
  console.log(`Explorer: ${EXPLORER}/address/${FACTORY}`);
  console.log(`Owner: ${read("owner()(address)")}`);
  console.log(`Pending owner: ${read("pendingOwner()(address)")}`);
  console.log(`Launch mode: ${labels[mode] ?? `unknown(${mode})`}`);
  console.log(`Global trading paused: ${read("globalTradingPaused()(bool)")}`);
  console.log(`New markets paused: ${read("newMarketsPaused()(bool)")}`);
  console.log(`Default max buy: ${read("defaultMaxBuyWei()(uint256)")} wei`);
  console.log(`Default max sell: ${read("defaultMaxSellTokenWad()(uint256)")} token-wad`);
  console.log(`Markets: ${read("marketCount()(uint256)")}`);
}

if (command === "status") {
  printStatus();
  process.exit(0);
}

const privateKey = process.env.V56_OWNER_PRIVATE_KEY;
if (!privateKey || !/^0x[0-9a-fA-F]{64}$/.test(privateKey)) throw new Error("Set V56_OWNER_PRIVATE_KEY locally for an admin write. Never put it in Vercel.");
if (process.env.V56_ADMIN_CONFIRM !== "I_UNDERSTAND_THIS_CHANGES_MAINNET") {
  throw new Error("Set V56_ADMIN_CONFIRM=I_UNDERSTAND_THIS_CHANGES_MAINNET for the deliberate admin command.");
}
const signer = run("cast", ["wallet", "address", "--private-key", privateKey], [privateKey]).toLowerCase();
const owner = read("owner()(address)").toLowerCase();
const pendingOwner = read("pendingOwner()(address)").toLowerCase();

let signature = "";
let callArgs: string[] = [];
if (command === "allow-creator") {
  if (signer !== owner) throw new Error(`Signer ${signer} is not factory owner ${owner}.`);
  if (!/^0x[0-9a-fA-F]{40}$/.test(args[0] ?? "")) throw new Error("Usage: allow-creator 0xAddress true|false");
  signature = "setCanaryCreator(address,bool)";
  callArgs = [args[0], boolArg(args[1])];
} else if (command === "launch-mode") {
  if (signer !== owner) throw new Error(`Signer ${signer} is not factory owner ${owner}.`);
  const modes: Record<string, string> = { closed: "0", allowlist: "1", public: "2" };
  const mode = modes[args[0] ?? ""];
  if (mode === undefined) throw new Error("Usage: launch-mode closed|allowlist|public");
  signature = "setLaunchMode(uint8)";
  callArgs = [mode];
} else if (command === "global-pause") {
  if (signer !== owner) throw new Error(`Signer ${signer} is not factory owner ${owner}.`);
  signature = "setGlobalTradingPaused(bool)";
  callArgs = [boolArg(args[0])];
} else if (command === "new-market-safety") {
  if (signer !== owner) throw new Error(`Signer ${signer} is not factory owner ${owner}.`);
  if (args.length < 3) throw new Error("Usage: new-market-safety true|false <maxBuyEth> <maxSellTokens>");
  signature = "setNewMarketSafety(bool,uint256,uint256)";
  callArgs = [boolArg(args[0]), parseUnits(args[1]).toString(), parseUnits(args[2]).toString()];
} else if (command === "market-safety") {
  if (signer !== owner) throw new Error(`Signer ${signer} is not factory owner ${owner}.`);
  if (!/^0x[0-9a-fA-F]{40}$/.test(args[0] ?? "") || args.length < 4) {
    throw new Error("Usage: market-safety 0xMarket true|false <maxBuyEth> <maxSellTokens>");
  }
  signature = "setMarketSafety(address,bool,uint256,uint256)";
  callArgs = [args[0], boolArg(args[1]), parseUnits(args[2]).toString(), parseUnits(args[3]).toString()];
} else if (command === "begin-owner") {
  if (signer !== owner) throw new Error(`Signer ${signer} is not factory owner ${owner}.`);
  if (!/^0x[0-9a-fA-F]{40}$/.test(args[0] ?? "")) throw new Error("Usage: begin-owner 0xNextOwner");
  signature = "beginOwnershipTransfer(address)";
  callArgs = [args[0]];
} else if (command === "accept-owner") {
  if (signer !== pendingOwner) throw new Error(`Signer ${signer} is not pending owner ${pendingOwner}.`);
  signature = "acceptOwnership()";
} else {
  throw new Error("Commands: status, allow-creator, launch-mode, global-pause, new-market-safety, market-safety, begin-owner, accept-owner");
}

const output = run("cast", ["send", FACTORY, signature, ...callArgs, "--rpc-url", RPC, "--private-key", privateKey, "--json"], [privateKey, RPC]);
let transactionHash = "";
try {
  const parsed = JSON.parse(output) as Record<string, unknown>;
  transactionHash = String(parsed.transactionHash ?? parsed.transaction_hash ?? "");
} catch { transactionHash = output.match(/0x[0-9a-fA-F]{64}/)?.[0] ?? ""; }
console.log(`Mainnet command confirmed: ${command}`);
if (transactionHash) console.log(`Transaction: ${EXPLORER}/tx/${transactionHash}`);
printStatus();
