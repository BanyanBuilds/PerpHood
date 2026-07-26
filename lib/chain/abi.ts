import { functionSelector } from "./keccak.ts";

export type Hex = `0x${string}`;

const WORD_HEX_LENGTH = 64;

export function stripHex(value: string) {
  return value.startsWith("0x") ? value.slice(2) : value;
}

export function padWord(value: string) {
  const normalized = stripHex(value);
  if (normalized.length > WORD_HEX_LENGTH) throw new Error("ABI word overflow.");
  return normalized.padStart(WORD_HEX_LENGTH, "0");
}

export function encodeUint(value: bigint | number) {
  const bigintValue = typeof value === "bigint" ? value : BigInt(value);
  if (bigintValue < 0n) throw new Error("Unsigned ABI values cannot be negative.");
  return padWord(bigintValue.toString(16));
}

export function encodeInt(value: bigint | number) {
  const bigintValue = typeof value === "bigint" ? value : BigInt(value);
  const max = 1n << 256n;
  return padWord((bigintValue < 0n ? max + bigintValue : bigintValue).toString(16));
}

export function encodeAddress(value: string) {
  const normalized = stripHex(value).toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(normalized)) throw new Error("Invalid EVM address.");
  return padWord(normalized);
}

export function encodeBytes32(value: string) {
  const normalized = stripHex(value);
  if (!/^[0-9a-fA-F]{64}$/.test(normalized)) throw new Error("Invalid bytes32 value.");
  return normalized.toLowerCase();
}

export function encodeCall(signature: string, words: string[] = []) {
  return `${functionSelector(signature)}${words.join("")}` as Hex;
}

export function decodeWords(value: string) {
  const normalized = stripHex(value);
  if (normalized.length % WORD_HEX_LENGTH) throw new Error("Malformed ABI response.");
  const words: string[] = [];
  for (let index = 0; index < normalized.length; index += WORD_HEX_LENGTH) words.push(normalized.slice(index, index + WORD_HEX_LENGTH));
  return words;
}

export function decodeUint(word: string) {
  return BigInt(`0x${word}`);
}

export function decodeInt(word: string) {
  const unsigned = decodeUint(word);
  const signBit = 1n << 255n;
  return unsigned & signBit ? unsigned - (1n << 256n) : unsigned;
}

export function decodeAddress(word: string) {
  return `0x${word.slice(24)}` as Hex;
}

export function decodeBytes32(word: string) {
  return `0x${word}` as Hex;
}

export function toRpcHex(value: bigint | number) {
  const bigintValue = typeof value === "bigint" ? value : BigInt(value);
  return `0x${bigintValue.toString(16)}` as Hex;
}

export function fromWad(value: bigint, precision = 8) {
  const whole = value / 1_000_000_000_000_000_000n;
  const fraction = value % 1_000_000_000_000_000_000n;
  const fractionString = fraction.toString().padStart(18, "0").slice(0, precision).replace(/0+$/, "");
  return Number(`${whole}${fractionString ? `.${fractionString}` : ""}`);
}

export function toWad(value: number | string) {
  const normalized = String(value).trim();
  if (!/^\d+(\.\d+)?$/.test(normalized)) throw new Error("Invalid decimal amount.");
  const [whole, fraction = ""] = normalized.split(".");
  return BigInt(whole) * 1_000_000_000_000_000_000n + BigInt(fraction.padEnd(18, "0").slice(0, 18));
}
