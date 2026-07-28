import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { eventTopic, functionSelector } from "../lib/chain/keccak.ts";

const factory = (process.env.LEVERAGEX_FACTORY_ADDRESS ?? process.env.V63_MAINNET_FACTORY_ADDRESS ?? "").toLowerCase();
const deploymentBlock = Number(process.env.LEVERAGEX_FACTORY_DEPLOYMENT_BLOCK ?? process.env.V63_FACTORY_DEPLOYMENT_BLOCK ?? 0) || null;
const site = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://perp-hood.vercel.app").replace(/\/$/, "");
const eventSignatures = {
  tokenLaunched: "TokenLaunched(address,address,address,address,uint256,uint256,bytes32)",
  marketCreated: "MarketCreated(address,address,address,uint256,uint256,uint256,uint256,bytes32)",
  trade: "Trade(address,bool,uint256,uint256,uint256,uint256,uint256,uint256)",
  tokenGraduated: "TokenGraduated(address,address,address,address,address,uint24)",
};
const readSignatures = [
  "getLaunchedToken(address)",
  "getTokenInfo(address)",
  "graduationStatus(address)",
  "isLeverageXToken(address)",
  "tokenCount()",
  "allTokens(uint256)",
  "marketForToken(address)",
  "runtimeState()",
  "metadataURI()",
];
const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as { version?: string };
const payload = {
  generatedAt: new Date().toISOString(),
  product: "leverage X",
  protocolVersion: "V63",
  appVersion: packageJson.version,
  releaseVersion: "V64",
  chain: { name: "Robinhood Chain", chainId: 4663, weth: "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73" },
  factory: { address: /^0x[0-9a-f]{40}$/.test(factory) ? factory : null, deploymentBlock },
  attribution: {
    launchpadId: "leverage-x-robinhood",
    tokenSupply: "1000000000000000000000000000",
    decimals: 18,
    transferTaxBps: 0,
    hiddenMinting: false,
    blacklist: false,
  },
  events: Object.fromEntries(Object.entries(eventSignatures).map(([name, signature]) => [name, { signature, topic0: eventTopic(signature) }])),
  reads: readSignatures.map((signature) => ({ signature, selector: functionSelector(signature) })),
  endpoints: {
    manifest: `${site}/api/v63/gmgn/manifest`,
    launches: `${site}/api/v63/gmgn/launches`,
    tokenTemplate: `${site}/api/v63/gmgn/token/{tokenAddress}`,
    wellKnown: `${site}/.well-known/leveragex-launchpad`,
    canaryEvidence: `${site}/api/v64/gmgn/evidence`,
  },
  preGraduationPricing: {
    model: "Leverage X native-ETH bonding curve",
    priceRead: "marginalPriceWad()",
    fullStateRead: "runtimeState()",
    tradeEvent: eventSignatures.trade,
    quoteToken: "native ETH",
  },
  postGraduationPricing: {
    authoritativeEvent: eventSignatures.tokenGraduated,
    poolRead: "getLaunchedToken(token).pool",
    note: "Use the external canonical DEX pool and preserve its native token order after graduation.",
  },
  replay: { confirmations: 3, order: ["blockNumber", "transactionIndex", "logIndex"], backfillCommand: "npm run chain:v63:gmgn:backfill" },
  contacts: {
    website: site,
    requestedListing: "Index Leverage X as a Robinhood Chain launchpad alongside Pons and other supported factories.",
  },
};
mkdirSync(resolve("deployments"), { recursive: true });
writeFileSync(resolve("deployments", "v63-gmgn-integration-package.json"), `${JSON.stringify(payload, null, 2)}\n`);
console.log("GMGN integration package written: deployments/v63-gmgn-integration-package.json");
console.log(payload.factory.address ? `Factory: ${payload.factory.address}` : "Factory address pending deployment.");
