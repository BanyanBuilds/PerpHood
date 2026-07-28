import "server-only";

import { readV62GoLiveReadiness } from "@/lib/server/v62-go-live-readiness";
import { listV63GmgnLaunches, v63FactoryAddress, v63Manifest } from "@/lib/server/v63-gmgn-feed";

const TX = /^0x[0-9a-fA-F]{64}$/;

function txHash(...values: Array<string | undefined>) {
  const value = values.find((candidate) => TX.test(candidate ?? ""));
  return value ? value.toLowerCase() : null;
}

async function receiptState(rpc: string | null, hash: string | null) {
  if (!rpc || !hash) return { hash, confirmed: false, blockNumber: null as number | null, status: null as string | null };
  try {
    const response = await fetch(rpc, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getTransactionReceipt", params: [hash] }),
      cache: "no-store",
    });
    const payload = await response.json() as { result?: { status?: string; blockNumber?: string } | null };
    const receipt = payload.result;
    return {
      hash,
      confirmed: receipt?.status === "0x1",
      blockNumber: receipt?.blockNumber ? Number(BigInt(receipt.blockNumber)) : null,
      status: receipt?.status ?? null,
    };
  } catch {
    return { hash, confirmed: false, blockNumber: null, status: null };
  }
}

export async function readV64FirstLaunchReadiness(origin?: string) {
  const [goLive, launchFeed] = await Promise.all([
    readV62GoLiveReadiness(),
    listV63GmgnLaunches({ limit: 5 }),
  ]);
  const manifest = v63Manifest(origin);
  const rpc = process.env.ROBINHOOD_MAINNET_RPC_URL
    ?? process.env.ROBINHOOD_CHAIN_RPC_URL
    ?? process.env.V48_RPC_URLS?.split(",").map((value: string) => value.trim()).find(Boolean)
    ?? null;
  const launchTx = txHash(process.env.V64_FIRST_LAUNCH_TX_HASH, process.env.V62_FIRST_LAUNCH_TX_HASH);
  const buyTx = txHash(process.env.V64_TRADER_BUY_TX_HASH);
  const approveTx = txHash(process.env.V64_TRADER_APPROVE_TX_HASH);
  const sellTx = txHash(process.env.V64_TRADER_SELL_TX_HASH);
  const [launchReceipt, buyReceipt, approveReceipt, sellReceipt] = await Promise.all([
    receiptState(rpc, launchTx),
    receiptState(rpc, buyTx),
    receiptState(rpc, approveTx),
    receiptState(rpc, sellTx),
  ]);
  const factory = v63FactoryAddress();
  const firstLaunch = launchFeed.launches[0] ?? null;
  const sourceVerified = manifest.attribution.sourceVerified;
  const factoryReady = Boolean(factory && manifest.attribution.deploymentBlock && goLive.factory.codePresent);
  const canaryLaunchConfirmed = Boolean(
    launchReceipt.confirmed
      && firstLaunch?.tokenAddress
      && firstLaunch.factoryAddress === factory,
  );
  const roundtripConfirmed = buyReceipt.confirmed && approveReceipt.confirmed && sellReceipt.confirmed;
  const gmgnEvidenceReady = factoryReady && sourceVerified && canaryLaunchConfirmed && roundtripConfirmed && launchFeed.configured;
  let next = {
    stage: "factory-preflight",
    command: "npm run chain:v64:factory:preflight",
    detail: "Compile, test, and estimate the closed/paused factory without signing.",
  };
  if (factoryReady && !goLive.gates.canaryConfigured) {
    next = { stage: "configure-canary", command: "npm run chain:v60:canary:preflight", detail: "Verify the one-creator allowlist state, then deliberately configure it locally." };
  } else if (goLive.gates.canaryConfigured && !canaryLaunchConfirmed) {
    next = { stage: "launch-first-token", command: "npm run chain:v64:first-token:preflight", detail: "Validate metadata, gas, budget, and the paused first-token launch transaction." };
  } else if (canaryLaunchConfirmed && !goLive.gates.cappedSpotOpen) {
    next = { stage: "prove-and-open", command: "npm run chain:v64:first-launch-proof", detail: "Prove the launch against chain + Supabase, then open exactly one capped Spot market." };
  } else if (goLive.gates.cappedSpotOpen && !roundtripConfirmed) {
    next = { stage: "trader-roundtrip", command: "npm run chain:v64:trader:roundtrip", detail: "Run one small external-wallet buy, approval, and sell." };
  } else if (roundtripConfirmed && !gmgnEvidenceReady) {
    next = { stage: "gmgn-package", command: "npm run gmgn:evidence:v64", detail: "Generate the real factory/token/market/transaction handoff package." };
  } else if (gmgnEvidenceReady) {
    next = { stage: "gmgn-check", command: firstLaunch?.tokenAddress ? `https://gmgn.ai/robinhood/token/${firstLaunch.tokenAddress}` : "Open GMGN Robinhood search", detail: "Test contract discovery, then send the generated onboarding package for the official Leverage X label." };
  }
  return {
    product: "leverage X",
    version: "V64",
    checkedAt: new Date().toISOString(),
    chain: goLive.chain,
    accounts: goLive.accounts,
    factory: { ...goLive.factory, sourceVerified, deploymentBlock: manifest.attribution.deploymentBlock },
    market: goLive.market,
    launchpad: {
      manifest: manifest.endpoints.manifest,
      launches: manifest.endpoints.launches,
      wellKnown: manifest.endpoints.wellKnown,
      configured: launchFeed.configured,
    },
    firstLaunch,
    transactions: { launch: launchReceipt, buy: buyReceipt, approve: approveReceipt, sell: sellReceipt },
    gates: {
      rpcReady: goLive.gates.rpcReady,
      factoryReady,
      sourceVerified,
      canaryConfigured: goLive.gates.canaryConfigured,
      canaryLaunchConfirmed,
      productionRegistryReady: goLive.gates.productionStorageReady && launchFeed.configured,
      cappedSpotOpen: goLive.gates.cappedSpotOpen,
      roundtripConfirmed,
      gmgnEvidenceReady,
      officialGmgnLabel: false,
      publicLaunchesAllowed: false,
      perpsAllowed: false,
    },
    next,
    error: goLive.error,
  };
}
