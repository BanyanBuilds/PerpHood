import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { eventTopic } from "../lib/chain/keccak.ts";
import { firstMarketFromFactory, readDeploymentJson, writeDeploymentJson } from "./v64-first-launch-common.mts";

const launch = readDeploymentJson<any>("v64-first-token-launch.json");
const proofPath = resolve("deployments", "v62-first-launch-proof.json");
if (!existsSync(proofPath)) throw new Error("Missing deployments/v62-first-launch-proof.json. Run npm run chain:v64:first-launch-proof first.");
const proof = JSON.parse(readFileSync(proofPath, "utf8")) as any;
const roundtrip = readDeploymentJson<any>("v64-trader-roundtrip.json");
const state = firstMarketFromFactory(launch.factory);
if (launch.factory !== proof.factory || launch.market !== proof.market?.address || launch.token !== proof.token?.address) {
  throw new Error("V64 launch manifest and first-launch proof do not describe the same factory/market/token.");
}
if (roundtrip.factory !== launch.factory || roundtrip.market !== launch.market || roundtrip.token !== launch.token) {
  throw new Error("V64 trader roundtrip does not match the first launched token.");
}
if (state.tradeCount < 3n) throw new Error("The live market does not yet contain genesis + trader buy + trader sell evidence.");
const site = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://perp-hood.vercel.app").replace(/\/$/, "");
const deploymentManifestPath = resolve("deployments", "leveragex-mainnet.json");
const deployment = existsSync(deploymentManifestPath) ? JSON.parse(readFileSync(deploymentManifestPath, "utf8")) as any : null;
const sourceVerified = process.env.LEVERAGEX_FACTORY_SOURCE_VERIFIED === "true" || deployment?.verification?.status === "submitted-and-confirmed-by-forge";
const [manifestResponse, tokenResponse] = await Promise.all([
  fetch(`${site}/api/v63/gmgn/manifest`, { cache: "no-store" }),
  fetch(`${site}/api/v63/gmgn/token/${launch.token}`, { cache: "no-store" }),
]);
if (!manifestResponse.ok) throw new Error(`Public GMGN manifest returned HTTP ${manifestResponse.status}. Deploy V64 to Vercel first.`);
if (!tokenResponse.ok) throw new Error(`Public token discovery returned HTTP ${tokenResponse.status}. Run the V63 backfill and confirm the Supabase launch record.`);
const publicToken = await tokenResponse.json() as { launch?: { tokenAddress?: string; bondingMarket?: string } };
if (publicToken.launch?.tokenAddress?.toLowerCase() !== launch.token || publicToken.launch?.bondingMarket?.toLowerCase() !== launch.market) {
  throw new Error("Public GMGN discovery does not match the live V64 token and market.");
}

const evidence = {
  generatedAt: new Date().toISOString(),
  product: "leverage X",
  requestedLaunchpadLabel: "Leverage X",
  chain: { name: "Robinhood Chain", chainId: 4663, wrappedNativeToken: "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73" },
  launchpad: {
    id: "leverage-x-robinhood",
    factoryAddress: launch.factory,
    factoryDeploymentBlock: deployment?.deployment?.blockNumber ?? null,
    factorySourceVerified: sourceVerified,
    factoryExplorer: `https://robinhoodchain.blockscout.com/address/${launch.factory}?tab=contract`,
    manifest: `${site}/api/v63/gmgn/manifest`,
    launches: `${site}/api/v63/gmgn/launches`,
    tokenLookup: `${site}/api/v63/gmgn/token/${launch.token}`,
    wellKnown: `${site}/.well-known/leveragex-launchpad`,
    abis: {
      factory: `${site}/integrations/gmgn/abi/LeverageXLaunchFactoryV63.json`,
      market: `${site}/integrations/gmgn/abi/LeverageXSpotMarketV63.json`,
      token: `${site}/integrations/gmgn/abi/LeverageXTokenV63.json`,
    },
  },
  canary: {
    token: launch.token,
    name: launch.identity.name,
    symbol: launch.identity.symbol,
    image: launch.identity.image,
    metadataUri: launch.identity.metadataUri,
    metadataHash: launch.identity.metadataHash,
    creator: launch.creator,
    bondingMarket: launch.market,
    canonicalPool: launch.market,
    poolType: "leveragex-bonding-v1",
    launchTransaction: launch.transactionHash,
    traderBuyTransaction: roundtrip.buy.transactionHash,
    traderApprovalTransaction: roundtrip.approve.transactionHash,
    traderSellTransaction: roundtrip.sell.transactionHash,
    gmgnDirectUrl: `https://gmgn.ai/robinhood/token/${launch.token}`,
  },
  events: {
    tokenLaunched: { signature: "TokenLaunched(address,address,address,address,uint256,uint256,bytes32)", topic0: eventTopic("TokenLaunched(address,address,address,address,uint256,uint256,bytes32)") },
    marketCreated: { signature: "MarketCreated(address,address,address,uint256,uint256,uint256,uint256,bytes32)", topic0: eventTopic("MarketCreated(address,address,address,uint256,uint256,uint256,uint256,bytes32)") },
    trade: { signature: "Trade(address,bool,uint256,uint256,uint256,uint256,uint256,uint256)", topic0: eventTopic("Trade(address,bool,uint256,uint256,uint256,uint256,uint256,uint256)") },
  },
  publicDiscovery: { manifestHttpStatus: manifestResponse.status, tokenLookupHttpStatus: tokenResponse.status, tokenAndMarketMatch: true },
  proof: {
    onchainIdentityAndSupply: Object.values(proof.checks ?? {}).every(Boolean),
    productionRegistryVerified: proof.registryVerified === true,
    externalBuyAndSellConfirmed: true,
    liveTradeCount: state.tradeCount.toString(),
  },
  request: "Please index Leverage X as a Robinhood Chain launchpad alongside Pons and other supported factories. The factory, launch events, token metadata, bonding-market price reads, historical replay feed, and real canary launch/buy/sell transactions are included above.",
  disclaimer: "This package proves the public integration surface and canary transactions. Only GMGN can approve the official launchpad label or custom pre-graduation router integration.",
};
writeDeploymentJson("v64-gmgn-canary-evidence.json", evidence);
writeFileSync(resolve("deployments", "v64-vercel-evidence.env"), [
  `V64_FIRST_LAUNCH_TX_HASH=${launch.transactionHash}`,
  `V64_TRADER_BUY_TX_HASH=${roundtrip.buy.transactionHash}`,
  `V64_TRADER_APPROVE_TX_HASH=${roundtrip.approve.transactionHash}`,
  `V64_TRADER_SELL_TX_HASH=${roundtrip.sell.transactionHash}`,
  `NEXT_PUBLIC_LEVERAGEX_FIRST_TOKEN_ADDRESS=${launch.token}`,
  `NEXT_PUBLIC_LEVERAGEX_FIRST_MARKET_ADDRESS=${launch.market}`,
  "",
].join("\n"));
const markdown = `# Leverage X — GMGN Robinhood Chain launchpad onboarding\n\nWe are requesting launchpad indexing for **Leverage X** alongside Pons and the other Robinhood Chain launchpads supported by GMGN.\n\n## Factory\n- Address: \`${evidence.launchpad.factoryAddress}\`\n- Deployment block: \`${evidence.launchpad.factoryDeploymentBlock ?? "pending"}\`\n- Verified source: ${sourceVerified ? "Yes" : "Pending"}\n- Manifest: ${evidence.launchpad.manifest}\n- Launch feed: ${evidence.launchpad.launches}\n\n## Real canary\n- Token: \`${evidence.canary.token}\`\n- Market: \`${evidence.canary.bondingMarket}\`\n- Launch tx: \`${evidence.canary.launchTransaction}\`\n- Buy tx: \`${evidence.canary.traderBuyTransaction}\`\n- Sell tx: \`${evidence.canary.traderSellTransaction}\`\n- GMGN direct URL: ${evidence.canary.gmgnDirectUrl}\n\n## Pricing before graduation\nRead \`marginalPriceWad()\` or \`runtimeState()\` from the bonding market and consume the indexed \`Trade\` event. After graduation, use the pool emitted by \`TokenGraduated\`.\n\n## Request\n${evidence.request}\n`;
writeFileSync(resolve("deployments", "V64_GMGN_ONBOARDING_MESSAGE.md"), markdown);
console.log("GMGN canary evidence: deployments/v64-gmgn-canary-evidence.json");
console.log("Ready-to-send message: deployments/V64_GMGN_ONBOARDING_MESSAGE.md");
console.log(`Manual GMGN check: ${evidence.canary.gmgnDirectUrl}`);
