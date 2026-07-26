import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { functionSelector, eventTopic } from "../lib/chain/keccak.ts";
import {
  V43_FACTORY_EVENT,
  encodeDynamicString,
  encodeV43CreateMarket,
  parseV43MarketCreated,
  v43MetadataHash,
} from "../lib/chain/launchpad-v43-client.ts";

const input = {
  name: "PerpHood Unified",
  symbol: "HOOD",
  description: "V43 unified BattlePool smoke market",
  creatorBuyEth: 0.00082,
  migrationTargetMarketCapUsd: 45_000,
};
const hashA = v43MetadataHash(input);
const hashB = v43MetadataHash({ ...input });
assert.equal(hashA, hashB, "V43 metadata hash must be deterministic");
assert.match(hashA, /^0x[0-9a-f]{64}$/);

const encoded = encodeV43CreateMarket(input.name, input.symbol, hashA, 45_000n * 10n ** 18n);
assert.ok(encoded.startsWith(functionSelector("createSandboxMarket(string,string,bytes32,uint256)")));
assert.equal((encoded.length - 2) % 64, 8, "selector plus ABI payload must preserve word alignment");
assert.ok(encodeDynamicString("HOOD").startsWith("0".repeat(63) + "4"));

const market = "0x1111111111111111111111111111111111111111";
const token = "0x2222222222222222222222222222222222222222";
const creator = "0x3333333333333333333333333333333333333333";
const topicAddress = (value: string) => `0x${value.slice(2).padStart(64, "0")}` as `0x${string}`;
const parsed = parseV43MarketCreated({
  blockNumber: "0x2b",
  logs: [{
    address: "0x4444444444444444444444444444444444444444",
    topics: [eventTopic(V43_FACTORY_EVENT), topicAddress(market), topicAddress(token), topicAddress(creator)],
    data: "0x",
  }],
});
assert.equal(parsed.marketAddress, market);
assert.equal(parsed.tokenAddress, token);
assert.equal(parsed.creatorAddress, creator);
assert.equal(parsed.blockNumber, 43);

const root = new URL("../", import.meta.url);
const [contract, cli, packageJson, sandboxRoute] = await Promise.all([
  readFile(new URL("contracts/src/LaunchpadFactoryV43.sol", root), "utf8"),
  readFile(new URL("scripts/v43-local-chain-cli.mts", root), "utf8"),
  readFile(new URL("package.json", root), "utf8"),
  readFile(new URL("app/api/launchpad/sandbox/route.ts", root), "utf8"),
]);
const contractChecks: Array<[string, boolean]> = [
  ["fixed one-billion supply", contract.includes("1_000_000_000 ether")],
  ["shared spot and perps market", contract.includes("function openLong") && contract.includes("function openShort")],
  ["manual and forced settlement", contract.includes("function closePosition") && contract.includes("function liquidate")],
  ["ordered state stream", contract.includes("event StateCommitted") && contract.includes("stateSequence")],
  ["short closeability reservation", contract.includes("maxCurveSoldWithShortReservationWad")],
  ["creator perps restriction", contract.includes("perpsRestricted[creator_] = true")],
  ["migration waits for settled positions", contract.includes("activePositionCount != 0 || badDebtWei != 0")],
  ["0.30 percent fees", contract.includes("TRADE_FEE_BPS = 30")],
];
for (const [label, passed] of contractChecks) assert.equal(passed, true, label);
assert.ok(cli.includes('execFileSync("forge"'));
assert.ok(cli.includes("v43-deployment.json"));
assert.ok(cli.includes("openLong(uint16,uint16,uint256)"));
assert.ok(cli.includes("openShort(uint16,uint16,uint256)"));
assert.ok(sandboxRoute.includes("longNotionalCapacityWei(uint16)"));
assert.ok(sandboxRoute.includes("shortNotionalCapacityWei()"));
const pkg = JSON.parse(packageJson) as { scripts: Record<string, string> };
assert.ok(pkg.scripts["chain:v43"]);
assert.ok(pkg.scripts["chain:v43:status"]);
console.log(`V43 local-chain launchpad smoke passed (${contractChecks.length} contract checks).`);
