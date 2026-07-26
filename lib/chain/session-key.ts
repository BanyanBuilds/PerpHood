import { keccak256 } from "./keccak.ts";
import type { Hex } from "./abi.ts";

export const SESSION_KEY_STORAGE = "perphood:v23:session-key";
export const SESSION_VERSION = 23;

export type SessionKeyMaterial = {
  version: 23;
  createdAt: number;
  publicJwk: JsonWebKey;
  privateJwk: JsonWebKey;
  publicKeyHash: Hex;
};

export type BoundSessionKey = SessionKeyMaterial & {
  owner: Hex;
  sessionId: Hex;
};

export type TradingIntent = {
  version: 23;
  sessionId: Hex;
  owner: Hex;
  marketId: Hex;
  nonce: number;
  action: number;
  notionalWad: string;
  collateralWad: string;
  tokenAmountWad: string;
  leverageBps: number;
  positionId: string;
  reduceFractionBps: number;
  limitPriceWad: string;
  maxSlippageBps: number;
  deadline: number;
  clientOrderId: string;
};

export type SignedTradingIntent = {
  intent: TradingIntent;
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
  const base64 = btoa(binary);
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
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
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) throw new Error("Invalid session owner address.");
  return address.toLowerCase() as Hex;
}

function normalizeBytes32(value: string, label: string) {
  if (!/^0x[0-9a-fA-F]{64}$/.test(value)) throw new Error(`Invalid ${label}.`);
  return value.toLowerCase() as Hex;
}

export function canonicalTradingIntent(intent: TradingIntent) {
  return JSON.stringify({
    version: intent.version,
    sessionId: normalizeBytes32(intent.sessionId, "session ID"),
    owner: normalizeAddress(intent.owner),
    marketId: normalizeBytes32(intent.marketId, "market ID"),
    nonce: intent.nonce,
    action: intent.action,
    notionalWad: String(intent.notionalWad),
    collateralWad: String(intent.collateralWad),
    tokenAmountWad: String(intent.tokenAmountWad),
    leverageBps: intent.leverageBps,
    positionId: intent.positionId,
    reduceFractionBps: intent.reduceFractionBps,
    limitPriceWad: String(intent.limitPriceWad),
    maxSlippageBps: intent.maxSlippageBps,
    deadline: intent.deadline,
    clientOrderId: intent.clientOrderId,
  });
}

export async function publicKeyHash(publicJwk: JsonWebKey) {
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

export function deriveSessionId(owner: string, keyHash: Hex) {
  const normalizedOwner = normalizeAddress(owner);
  const normalizedHash = normalizeBytes32(keyHash, "public-key hash");
  return keccak256(new TextEncoder().encode(`PERPHOOD_SESSION_V23|${normalizedOwner}|${normalizedHash}`));
}

export async function createSessionKeyMaterial(): Promise<SessionKeyMaterial> {
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
    version: SESSION_VERSION,
    createdAt: Date.now(),
    publicJwk,
    privateJwk,
    publicKeyHash: await publicKeyHash(publicJwk),
  };
}

export function bindSessionKey(material: SessionKeyMaterial, owner: string): BoundSessionKey {
  const normalizedOwner = normalizeAddress(owner);
  return {
    ...material,
    owner: normalizedOwner,
    sessionId: deriveSessionId(normalizedOwner, material.publicKeyHash),
  };
}

export function saveSessionKey(material: SessionKeyMaterial) {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.setItem(SESSION_KEY_STORAGE, JSON.stringify(material));
}

export function loadSessionKey(): SessionKeyMaterial | null {
  if (typeof sessionStorage === "undefined") return null;
  const raw = sessionStorage.getItem(SESSION_KEY_STORAGE);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as SessionKeyMaterial;
    if (parsed.version !== SESSION_VERSION || !parsed.privateJwk || !parsed.publicJwk) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearSessionKey() {
  if (typeof sessionStorage !== "undefined") sessionStorage.removeItem(SESSION_KEY_STORAGE);
}

export async function signTradingIntent(
  material: SessionKeyMaterial,
  intent: TradingIntent,
): Promise<SignedTradingIntent> {
  if (intent.version !== SESSION_VERSION) throw new Error("Unsupported trading-intent version.");
  const expectedSessionId = deriveSessionId(intent.owner, material.publicKeyHash);
  if (intent.sessionId.toLowerCase() !== expectedSessionId.toLowerCase()) throw new Error("Intent session ID does not match the key.");
  const privateKey = await cryptoApi().subtle.importKey(
    "jwk",
    material.privateJwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const canonical = new TextEncoder().encode(canonicalTradingIntent(intent));
  const signature = new Uint8Array(await cryptoApi().subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    privateKey,
    canonical,
  ));
  return {
    intent,
    intentHash: keccak256(canonical),
    signature: bytesToBase64Url(signature),
    publicJwk: material.publicJwk,
    publicKeyHash: material.publicKeyHash,
  };
}

export async function verifySignedTradingIntent(signed: SignedTradingIntent) {
  const computedKeyHash = await publicKeyHash(signed.publicJwk);
  if (computedKeyHash.toLowerCase() !== signed.publicKeyHash.toLowerCase()) return false;
  const expectedSessionId = deriveSessionId(signed.intent.owner, computedKeyHash);
  if (expectedSessionId.toLowerCase() !== signed.intent.sessionId.toLowerCase()) return false;
  const canonical = new TextEncoder().encode(canonicalTradingIntent(signed.intent));
  if (keccak256(canonical).toLowerCase() !== signed.intentHash.toLowerCase()) return false;
  const publicKey = await cryptoApi().subtle.importKey(
    "jwk",
    signed.publicJwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["verify"],
  );
  return cryptoApi().subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    publicKey,
    base64UrlToBytes(signed.signature),
    canonical,
  );
}

export function actionBitmap(actions: number[]) {
  return actions.reduce((bitmap, action) => {
    if (!Number.isInteger(action) || action < 0 || action > 255) throw new Error("Invalid action index.");
    return bitmap | (1n << BigInt(action));
  }, 0n);
}

export const ALL_TRADING_ACTION_BITMAP = actionBitmap([1, 2, 3, 4, 5, 6]);
