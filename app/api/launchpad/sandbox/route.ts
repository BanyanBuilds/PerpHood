import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { decodeUint, decodeWords, encodeAddress, encodeCall, encodeUint } from "@/lib/chain/abi";
import { functionSelector } from "@/lib/chain/keccak";

export const dynamic = "force-dynamic";

const rpcUrl = process.env.LOCAL_CHAIN_RPC ?? process.env.NEXT_PUBLIC_LOCAL_CHAIN_RPC ?? "http://127.0.0.1:8545";

async function rpc<T>(method: string, params: unknown[] = []) {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params }),
    cache: "no-store",
    signal: AbortSignal.timeout(1_500),
  });
  if (!response.ok) throw new Error(`RPC HTTP ${response.status}`);
  const payload = await response.json() as { result?: T; error?: { message: string } };
  if (payload.error) throw new Error(payload.error.message);
  return payload.result;
}


function selector(signature: string, values: Array<number | bigint> = []) {
  return `${functionSelector(signature)}${values.map((value) => encodeUint(value)).join("")}`;
}

async function readUint(to: string, signature: string, values: Array<number | bigint> = []) {
  const result = await rpc<string>("eth_call", [{ to, data: selector(signature, values) }, "latest"]);
  return result ? BigInt(result) : 0n;
}

async function readDemoState(manifest: Record<string, unknown> | null) {
  const market = typeof manifest?.demoMarketAddress === "string" ? manifest.demoMarketAddress : null;
  if (!market) return null;
  const [
    sequence, price, marketCap, realWeth, freeWeth, curveSold, longOi, shortOi, positions, badDebt,
    maxSpotSell, longCapacity5x, shortCapacity,
  ] = await Promise.all([
    readUint(market, "stateSequence()"),
    readUint(market, "marginalPriceWad()"),
    readUint(market, "marketCapEthWad()"),
    readUint(market, "realWethBalanceWei()"),
    readUint(market, "freeWethWei()"),
    readUint(market, "curveSoldTokenWad()"),
    readUint(market, "openInterestLongWei()"),
    readUint(market, "openInterestShortWei()"),
    readUint(market, "activePositionCount()"),
    readUint(market, "badDebtWei()"),
    readUint(market, "maxSpotSellTokensWad()"),
    readUint(market, "longNotionalCapacityWei(uint16)", [5]),
    readUint(market, "shortNotionalCapacityWei()"),
  ]);
  const eth = (value: bigint) => Number(value) / 1e18;
  return {
    market,
    sequence: Number(sequence),
    priceEth: eth(price),
    marketCapEth: eth(marketCap),
    realWethEth: eth(realWeth),
    freeWethEth: eth(freeWeth),
    curveSoldTokens: eth(curveSold),
    longOpenInterestEth: eth(longOi),
    shortOpenInterestEth: eth(shortOi),
    activePositions: Number(positions),
    badDebtEth: eth(badDebt),
    maxSpotSellTokens: eth(maxSpotSell),
    longCapacity5xEth: eth(longCapacity5x),
    shortCapacityEth: eth(shortCapacity),
  };
}


async function readDemoAccountState(manifest: Record<string, unknown> | null) {
  const router = typeof manifest?.accountRouterAddress === "string" ? manifest.accountRouterAddress : typeof manifest?.factoryAddress === "string" ? manifest.factoryAddress : null;
  const market = typeof manifest?.demoMarketAddress === "string" ? manifest.demoMarketAddress : null;
  const account = typeof manifest?.spotTrader === "string" ? manifest.spotTrader : null;
  if (!router || !market || !account) return null;
  const result = await rpc<string>("eth_call", [{ to: router, data: encodeCall("accountState(address,address)", [encodeAddress(account), encodeAddress(market)]) }, "latest"]);
  const words = decodeWords(result ?? "0x");
  if (words.length < 7) return null;
  const eth = (value: bigint) => Number(value) / 1e18;
  return {
    account,
    accountWethEth: eth(decodeUint(words[0])),
    accountTokenAmount: eth(decodeUint(words[1])),
    routerEthEth: eth(decodeUint(words[2])),
    routerTokenAmount: eth(decodeUint(words[3])),
    wethLiabilityEth: eth(decodeUint(words[4])),
    tokenLiabilityAmount: eth(decodeUint(words[5])),
    solvent: decodeUint(words[6]) === 1n,
  };
}

export async function GET() {
  let manifest: Record<string, unknown> | null = null;
  try {
    manifest = JSON.parse(await readFile(join(process.cwd(), "public", "local-chain", "v45-deployment.json"), "utf8")) as Record<string, unknown>;
  } catch {
    // A missing manifest is the expected pre-bootstrap state.
  }

  try {
    const [chainHex, blockHex, accounts] = await Promise.all([
      rpc<string>("eth_chainId"),
      rpc<string>("eth_blockNumber"),
      rpc<string[]>("eth_accounts"),
    ]);
    const chainId = chainHex ? Number(BigInt(chainHex)) : null;
    let demoState = null;
    let demoAccountState = null;
    try { demoState = await readDemoState(manifest); } catch { /* Deployment may predate the latest V45 ABI. */ }
    try { demoAccountState = await readDemoAccountState(manifest); } catch { /* Account router may not be deployed yet. */ }
    return NextResponse.json({
      ok: chainId === 31_337,
      rpcConnected: true,
      rpcUrl,
      chainId,
      blockNumber: blockHex ? Number(BigInt(blockHex)) : null,
      unlockedAccounts: accounts?.length ?? 0,
      factoryAddress: process.env.V45_LAUNCHPAD_FACTORY_ADDRESS
        ?? process.env.NEXT_PUBLIC_V45_LAUNCHPAD_FACTORY_ADDRESS
        ?? process.env.NEXT_PUBLIC_V45_ACCOUNT_ROUTER_ADDRESS
        ?? process.env.V43_LAUNCHPAD_FACTORY_ADDRESS
        ?? process.env.NEXT_PUBLIC_V43_LAUNCHPAD_FACTORY_ADDRESS
        ?? manifest?.factoryAddress
        ?? null,
      manifest,
      demoState,
      demoAccountState,
      executableSpotCurve: true,
      fullPerpsSettlement: true,
      internalAccountLedger: true,
      sponsoredSessionExecution: true,
      warning: "V45 is an unaudited authorized-account settlement sandbox and must never custody public funds.",
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      rpcConnected: false,
      rpcUrl,
      chainId: null,
      blockNumber: null,
      unlockedAccounts: 0,
      factoryAddress: process.env.V45_LAUNCHPAD_FACTORY_ADDRESS
        ?? process.env.NEXT_PUBLIC_V45_LAUNCHPAD_FACTORY_ADDRESS
        ?? process.env.NEXT_PUBLIC_V45_ACCOUNT_ROUTER_ADDRESS
        ?? process.env.V43_LAUNCHPAD_FACTORY_ADDRESS
        ?? process.env.NEXT_PUBLIC_V43_LAUNCHPAD_FACTORY_ADDRESS
        ?? manifest?.factoryAddress
        ?? null,
      manifest,
      demoState: null,
      demoAccountState: null,
      executableSpotCurve: true,
      fullPerpsSettlement: true,
      internalAccountLedger: true,
      sponsoredSessionExecution: true,
      error: error instanceof Error ? error.message : "Local RPC unavailable.",
      warning: "Start Anvil and run npm run chain:v45 before using contract mode.",
    });
  }
}
