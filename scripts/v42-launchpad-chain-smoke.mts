import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { functionSelector, eventTopic } from "../lib/chain/keccak.ts";
import {
  V42_FACTORY_EVENT,
  encodeDynamicString,
  encodeV42CreateMarket,
  parseV42MarketCreated,
  v42MetadataHash,
} from "../lib/chain/launchpad-v42-client.ts";

const input = {
  name: "PerpHood Local",
  symbol: "HOOD",
  description: "V42 local launchpad smoke market",
  creatorBuyEth: 0.00082,
  migrationTargetMarketCapUsd: 45_000,
};
const hashA = v42MetadataHash(input);
const hashB = v42MetadataHash({ ...input });
assert.equal(hashA, hashB, "metadata hash must be deterministic");
assert.match(hashA, /^0x[0-9a-f]{64}$/);

const encoded = encodeV42CreateMarket(input.name, input.symbol, hashA, 45_000n * 10n ** 18n);
assert.ok(encoded.startsWith(functionSelector("createSandboxMarket(string,string,bytes32,uint256)")));
assert.equal((encoded.length - 2) % 64, 8, "selector plus ABI payload must preserve word alignment");
assert.ok(encodeDynamicString("HOOD").startsWith("0".repeat(63) + "4"));

const market = "0x1111111111111111111111111111111111111111";
const token = "0x2222222222222222222222222222222222222222";
const creator = "0x3333333333333333333333333333333333333333";
const topicAddress = (value: string) => `0x${value.slice(2).padStart(64, "0")}` as `0x${string}`;
const parsed = parseV42MarketCreated({
  blockNumber: "0x2a",
  logs: [{
    address: "0x4444444444444444444444444444444444444444",
    topics: [eventTopic(V42_FACTORY_EVENT), topicAddress(market), topicAddress(token), topicAddress(creator)],
    data: "0x",
  }],
});
assert.equal(parsed.marketAddress, market);
assert.equal(parsed.tokenAddress, token);
assert.equal(parsed.creatorAddress, creator);
assert.equal(parsed.blockNumber, 42);

const root = new URL("../", import.meta.url);
const [contract, cli, packageJson] = await Promise.all([
  readFile(new URL("contracts/src/LaunchpadFactoryV42.sol", root), "utf8"),
  readFile(new URL("scripts/v42-local-chain-cli.mts", root), "utf8"),
  readFile(new URL("package.json", root), "utf8"),
]);
const contractChecks: Array<[string, boolean]> = [
  ["one-billion token supply", contract.includes("1_000_000_000 ether")],
  ["creator genesis purchase executes in constructor", contract.includes("_buy(creator_, msg.value)")],
  ["exponent-five curve library", contract.includes("BattleCurveMathV24.quoteBuy") && contract.includes("BattleCurveMathV24.quoteSell")],
  ["spot buy and sell are executable", contract.includes("function buy()") && contract.includes("function sell(uint256 tokenAmountWad)")],
  ["creator perps restriction", contract.includes("CreatorPerpsForbidden") && contract.includes("assertPerpsAllowed")],
  ["migration commitments", contract.includes("beginMigration") && contract.includes("commitMigration")],
  ["factory registry", contract.includes("mapping(address => address) public marketForToken")],
  ["0.30 percent fee", contract.includes("TRADE_FEE_BPS = 30")],
];
for (const [label, passed] of contractChecks) assert.equal(passed, true, label);
assert.ok(cli.includes('execFileSync("forge"'));
assert.ok(cli.includes("v42-deployment.json"));
assert.ok(cli.includes("createSandboxMarket(string,string,bytes32,uint256)"));
const pkg = JSON.parse(packageJson) as { scripts: Record<string, string> };
assert.ok(pkg.scripts["chain:v42"]);
assert.ok(pkg.scripts["chain:v42:status"]);
console.log(`V42 local-chain launchpad smoke passed (${contractChecks.length} contract checks).`);
