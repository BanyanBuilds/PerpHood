import { keccak256 } from "./keccak.ts";
import type { Hex } from "./abi.ts";

export const V45_SESSION_KEY_STORAGE = "perphood:v45:session-key";
export const V45_ACCOUNT_STORAGE = "perphood:v45:account";
export const V45_SESSION_VERSION = 45;

export type V45SessionKeyMaterial = {
  version: 45;
  createdAt: number;
  publicJwk: JsonWebKey;
  privateJwk: JsonWebKey;
  publicKeyHash: Hex;
};

export type V45BoundSessionKey = V45SessionKeyMaterial & {
  owner: Hex;
  sessionId: Hex;
};

export type V45TradingIntent = {
  version: 45;
  sessionId: Hex;
  owner: Hex;
  router: Hex;
  market: Hex;
  nonce: number;
  action: number;
  amountWei: string;
  collateralWei: string;
  tokenAmountWad: string;
  leverage: number;
  maintenanceMarginBps: number;
  positionId: string;
  minOutput: string;
  deadline: number;
  clientOrderId: string;
};

export type V45SignedTradingIntent = {
  intent: V45TradingIntent;
  intentHash: Hex;
  signature: string;
  publicJwk: JsonWebKey;
  publicKeyHash: Hex;
};

function cryptoApi() {
  if (!globalThis.crypto?.subtle) throw new Error("Web Crypto is unavailable in this runtime.");
  return globalThis.crypto;
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  if (typeof btoa !== "function") throw new Error("Base64 encoder is unavailable.");
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  if (typeof atob !== "function") throw new Error("Base64 decoder is unavailable.");
  const binary = atob(normalized);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function bytesToHex(bytes: Uint8Array) {
  return `0x${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}` as Hex;
}

function normalizeAddress(address: string) {
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) throw new Error("Invalid V45 address.");
  return address.toLowerCase() as Hex;
}

function normalizeBytes32(value: string, label: string) {
  if (!/^0x[0-9a-fA-F]{64}$/.test(value)) throw new Error(`Invalid ${label}.`);
  return value.toLowerCase() as Hex;
}

export function canonicalV45TradingIntent(intent: V45TradingIntent) {
  return JSON.stringify({
    version: intent.version,
    sessionId: normalizeBytes32(intent.sessionId, "session ID"),
    owner: normalizeAddress(intent.owner),
    router: normalizeAddress(intent.router),
    market: normalizeAddress(intent.market),
    nonce: intent.nonce,
    action: intent.action,
    amountWei: String(intent.amountWei),
    collateralWei: String(intent.collateralWei),
    tokenAmountWad: String(intent.tokenAmountWad),
    leverage: intent.leverage,
    maintenanceMarginBps: intent.maintenanceMarginBps,
    positionId: String(intent.positionId),
    minOutput: String(intent.minOutput),
    deadline: intent.deadline,
    clientOrderId: intent.clientOrderId,
  });
}

export async function v45PublicKeyHash(publicJwk: JsonWebKey) {
  if (!publicJwk.x || !publicJwk.y || publicJwk.crv !== "P-256") throw new Error("Session public key is not P-256.");
  const x = base64UrlToBytes(publicJwk.x);
  const y = base64UrlToBytes(publicJwk.y);
  if (x.length !== 32 || y.length !== 32) throw new Error("Malformed P-256 public key coordinates.");
  const uncompressed = new Uint8Array(65);
  uncompressed[0] = 4;
  uncompressed.set(x, 1);
  uncompressed.set(y, 33);
  const digest = await cryptoApi().subtle.digest("SHA-256", uncompressed);
  return bytesToHex(new Uint8Array(digest));
}

export function deriveV45SessionId(owner: string, keyHash: Hex) {
  const normalizedOwner = normalizeAddress(owner);
  const normalizedHash = normalizeBytes32(keyHash, "public-key hash");
  return keccak256(new TextEncoder().encode(`LEVERAGE X_SESSION_V45|${normalizedOwner}|${normalizedHash}`));
}

export async function createV45SessionKeyMaterial(): Promise<V45SessionKeyMaterial> {
  const pair = await cryptoApi().subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  ) as CryptoKeyPair;
  const [publicJwk, privateJwk] = await Promise.all([
    cryptoApi().subtle.exportKey("jwk", pair.publicKey),
    cryptoApi().subtle.exportKey("jwk", pair.privateKey),
  ]);
  return {
    version: V45_SESSION_VERSION,
    createdAt: Date.now(),
    publicJwk,
    privateJwk,
    publicKeyHash: await v45PublicKeyHash(publicJwk),
  };
}

export function bindV45SessionKey(material: V45SessionKeyMaterial, owner: string): V45BoundSessionKey {
  const normalizedOwner = normalizeAddress(owner);
  return { ...material, owner: normalizedOwner, sessionId: deriveV45SessionId(normalizedOwner, material.publicKeyHash) };
}

export function saveV45SessionKey(material: V45SessionKeyMaterial) {
  if (typeof sessionStorage !== "undefined") sessionStorage.setItem(V45_SESSION_KEY_STORAGE, JSON.stringify(material));
}

export function loadV45SessionKey(): V45SessionKeyMaterial | null {
  if (typeof sessionStorage === "undefined") return null;
  const raw = sessionStorage.getItem(V45_SESSION_KEY_STORAGE);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as V45SessionKeyMaterial;
    return parsed.version === V45_SESSION_VERSION && parsed.privateJwk && parsed.publicJwk ? parsed : null;
  } catch {
    return null;
  }
}

export function clearV45SessionKey() {
  if (typeof sessionStorage !== "undefined") sessionStorage.removeItem(V45_SESSION_KEY_STORAGE);
}

export function saveV45Account(account: string) {
  const normalized = normalizeAddress(account);
  if (typeof localStorage !== "undefined") localStorage.setItem(V45_ACCOUNT_STORAGE, normalized);
  return normalized;
}

export function loadV45Account(): Hex | null {
  if (typeof localStorage === "undefined") return null;
  const value = localStorage.getItem(V45_ACCOUNT_STORAGE);
  return value && /^0x[0-9a-fA-F]{40}$/.test(value) ? value.toLowerCase() as Hex : null;
}

export type V45SignedCanonicalPayload = {
  payloadHash: Hex;
  signature: string;
  publicJwk: JsonWebKey;
  publicKeyHash: Hex;
};

export async function signV45CanonicalPayload(material: V45SessionKeyMaterial, canonicalPayload: string): Promise<V45SignedCanonicalPayload> {
  const privateKey = await cryptoApi().subtle.importKey("jwk", material.privateJwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const canonical = new TextEncoder().encode(canonicalPayload);
  const signature = new Uint8Array(await cryptoApi().subtle.sign({ name: "ECDSA", hash: "SHA-256" }, privateKey, canonical));
  return {
    payloadHash: keccak256(canonical),
    signature: bytesToBase64Url(signature),
    publicJwk: material.publicJwk,
    publicKeyHash: material.publicKeyHash,
  };
}

export async function verifyV45CanonicalPayload(input: V45SignedCanonicalPayload, canonicalPayload: string) {
  const computedKeyHash = await v45PublicKeyHash(input.publicJwk);
  if (computedKeyHash.toLowerCase() !== input.publicKeyHash.toLowerCase()) return false;
  const canonical = new TextEncoder().encode(canonicalPayload);
  if (keccak256(canonical).toLowerCase() !== input.payloadHash.toLowerCase()) return false;
  const publicKey = await cryptoApi().subtle.importKey("jwk", input.publicJwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
  return cryptoApi().subtle.verify({ name: "ECDSA", hash: "SHA-256" }, publicKey, base64UrlToBytes(input.signature), canonical);
}

export async function signV45TradingIntent(material: V45SessionKeyMaterial, intent: V45TradingIntent): Promise<V45SignedTradingIntent> {
  if (intent.version !== V45_SESSION_VERSION) throw new Error("Unsupported V45 trading-intent version.");
  const expectedSessionId = deriveV45SessionId(intent.owner, material.publicKeyHash);
  if (intent.sessionId.toLowerCase() !== expectedSessionId.toLowerCase()) throw new Error("Intent session ID does not match the key.");
  const privateKey = await cryptoApi().subtle.importKey("jwk", material.privateJwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const canonical = new TextEncoder().encode(canonicalV45TradingIntent(intent));
  const signature = new Uint8Array(await cryptoApi().subtle.sign({ name: "ECDSA", hash: "SHA-256" }, privateKey, canonical));
  return {
    intent,
    intentHash: keccak256(canonical),
    signature: bytesToBase64Url(signature),
    publicJwk: material.publicJwk,
    publicKeyHash: material.publicKeyHash,
  };
}

export async function verifyV45SignedTradingIntent(signed: V45SignedTradingIntent) {
  const computedKeyHash = await v45PublicKeyHash(signed.publicJwk);
  if (computedKeyHash.toLowerCase() !== signed.publicKeyHash.toLowerCase()) return false;
  if (deriveV45SessionId(signed.intent.owner, computedKeyHash).toLowerCase() !== signed.intent.sessionId.toLowerCase()) return false;
  const canonical = new TextEncoder().encode(canonicalV45TradingIntent(signed.intent));
  if (keccak256(canonical).toLowerCase() !== signed.intentHash.toLowerCase()) return false;
  const publicKey = await cryptoApi().subtle.importKey("jwk", signed.publicJwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
  return cryptoApi().subtle.verify({ name: "ECDSA", hash: "SHA-256" }, publicKey, base64UrlToBytes(signed.signature), canonical);
}

export function v45ActionBitmap(actions: number[]) {
  return actions.reduce((bitmap, action) => {
    if (!Number.isInteger(action) || action < 1 || action > 6) throw new Error("Invalid V45 action index.");
    return bitmap | (1n << BigInt(action));
  }, 0n);
}

export const V45_ALL_TRADING_ACTION_BITMAP = v45ActionBitmap([1, 2, 3, 4, 5, 6]);
