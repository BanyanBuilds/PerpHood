import { spawnSync, type SpawnSyncOptionsWithStringEncoding } from "node:child_process";

export const V59_NETWORK = {
  name: "Robinhood Chain Mainnet",
  chainId: 4_663,
  explorer: "https://robinhoodchain.blockscout.com",
  blockscoutApi: "https://robinhoodchain.blockscout.com/api/",
} as const;

export const V59_FACTORY_TARGET = "contracts/src/LeverageXLaunchFactoryV60.sol:LeverageXLaunchFactoryV60";
export const V59_MARKET_TARGET = "contracts/src/LeverageXLaunchFactoryV60.sol:LeverageXSpotMarketV60";
export const V59_TOKEN_TARGET = "contracts/src/LeverageXLaunchFactoryV60.sol:LeverageXTokenV60";
export const DEFAULT_DEPLOYER = "0x728fa84C70f7b88Ab59C86379745FdDBbDd7AD07".toLowerCase();
export const DEFAULT_FIRST_TRADER = "0x1728DC75f70070DC74Ae2172EF94970e04D9830C".toLowerCase();
export const EIP170_RUNTIME_LIMIT_BYTES = 24_576;

export function requireRpc() {
  const rpc = process.env.ROBINHOOD_MAINNET_RPC_URL
    ?? process.env.ROBINHOOD_CHAIN_RPC_URL
    ?? process.env.V48_RPC_URLS?.split(",").map((value) => value.trim()).find(Boolean);
  if (!rpc) throw new Error("Set ROBINHOOD_MAINNET_RPC_URL in .env.mainnet.local to the private Alchemy Robinhood Chain mainnet HTTPS endpoint.");
  if (!/^https:\/\//i.test(rpc)) throw new Error("ROBINHOOD_MAINNET_RPC_URL must be an HTTPS endpoint.");
  return rpc;
}

export function normalizeAddress(value: string | undefined, label: string, fallback?: string) {
  const candidate = (value || fallback || "").trim();
  if (!/^0x[0-9a-fA-F]{40}$/.test(candidate)) throw new Error(`${label} must be a valid EVM address.`);
  return candidate.toLowerCase();
}

export function redactRpc(value: string) {
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.host}/v2/[REDACTED]`;
  } catch {
    return "configured private endpoint";
  }
}

export function run(command: string, args: string[], options: { capture?: boolean; redact?: string[]; input?: string } = {}) {
  const spawnOptions: SpawnSyncOptionsWithStringEncoding = {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: options.capture === false ? "inherit" : "pipe",
    env: process.env,
    input: options.input,
  };
  const result = spawnSync(command, args, spawnOptions);
  if (result.error) {
    if ((result.error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`${command} is not installed or is not available in PATH.`);
    }
    throw result.error;
  }
  if (result.status !== 0) {
    let detail = `${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim();
    for (const secret of options.redact ?? []) {
      if (secret) detail = detail.split(secret).join("[REDACTED]");
    }
    throw new Error(`${command} ${args[0] ?? ""} failed with exit code ${result.status}.${detail ? `\n${detail}` : ""}`);
  }
  return String(result.stdout ?? "").trim();
}

export async function rpcRequest<T>(rpc: string, method: string, params: unknown[] = [], timeoutMs = 12_000): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(rpc, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`RPC HTTP ${response.status}`);
    const payload = await response.json() as { result?: T; error?: { code?: number; message?: string; data?: unknown } };
    if (payload.error) throw new Error(`RPC ${method} failed (${payload.error.code ?? "unknown"}): ${payload.error.message ?? "unknown error"}`);
    if (payload.result === undefined) throw new Error(`RPC ${method} returned no result.`);
    return payload.result;
  } finally {
    clearTimeout(timeout);
  }
}

export function hexToBigInt(value: string) {
  if (!/^0x[0-9a-fA-F]+$/.test(value)) throw new Error(`Invalid RPC hex value: ${value}`);
  return BigInt(value);
}

export function toRpcHex(value: bigint) {
  if (value < 0n) throw new Error("RPC hex values cannot be negative.");
  return `0x${value.toString(16)}`;
}

export function encodeAddressWord(address: string) {
  return address.toLowerCase().replace(/^0x/, "").padStart(64, "0");
}

export function byteLength(hex: string) {
  const normalized = hex.trim().replace(/^0x/, "");
  if (!normalized || !/^[0-9a-fA-F]+$/.test(normalized) || normalized.length % 2 !== 0) return 0;
  return normalized.length / 2;
}

export function formatEth(wei: bigint, maximumFractionDigits = 8) {
  const whole = wei / 10n ** 18n;
  const fraction = (wei % 10n ** 18n).toString().padStart(18, "0").slice(0, maximumFractionDigits).replace(/0+$/, "");
  return `${whole.toLocaleString("en-US")}${fraction ? `.${fraction}` : ""}`;
}

export function parseForgeCreateOutput(output: string) {
  let factoryAddress = "";
  let transactionHash = "";
  try {
    const parsed = JSON.parse(output) as Record<string, unknown>;
    factoryAddress = String(parsed.deployedTo ?? parsed.deployed_to ?? parsed.contractAddress ?? "");
    transactionHash = String(parsed.transactionHash ?? parsed.transaction_hash ?? "");
  } catch {
    factoryAddress = output.match(/(?:Deployed to|deployedTo|contractAddress)\D+(0x[0-9a-fA-F]{40})/i)?.[1] ?? "";
    transactionHash = output.match(/(?:Transaction hash|transactionHash)\D+(0x[0-9a-fA-F]{64})/i)?.[1] ?? "";
  }
  if (!factoryAddress) factoryAddress = (output.match(/0x[0-9a-fA-F]{40}/g) ?? []).at(-1) ?? "";
  if (!transactionHash) transactionHash = (output.match(/0x[0-9a-fA-F]{64}/g) ?? [])[0] ?? "";
  return {
    factoryAddress: factoryAddress.toLowerCase(),
    transactionHash: transactionHash.toLowerCase(),
  };
}

export function walletArgs(): { args: string[]; expectedAddress: string; redactions: string[]; mode: "keystore" | "private-key" } {
  const expectedAddress = normalizeAddress(process.env.V59_EXPECTED_DEPLOYER_ADDRESS, "V59_EXPECTED_DEPLOYER_ADDRESS", DEFAULT_DEPLOYER);
  const account = process.env.V59_KEYSTORE_ACCOUNT?.trim();
  const passwordFile = process.env.V59_KEYSTORE_PASSWORD_FILE?.trim();
  const privateKey = process.env.V59_DEPLOYER_PRIVATE_KEY?.trim();

  if (account) {
    const args = ["--account", account];
    if (passwordFile) args.push("--password-file", passwordFile);
    return { args, expectedAddress, redactions: [passwordFile ?? ""], mode: "keystore" };
  }
  if (privateKey) {
    if (!/^0x[0-9a-fA-F]{64}$/.test(privateKey)) throw new Error("V59_DEPLOYER_PRIVATE_KEY must be a 32-byte hex key.");
    return { args: ["--private-key", privateKey], expectedAddress, redactions: [privateKey], mode: "private-key" };
  }
  throw new Error("Configure V59_KEYSTORE_ACCOUNT (preferred) or V59_DEPLOYER_PRIVATE_KEY locally. Never add either secret to Vercel, Supabase, GitHub, or chat.");
}
