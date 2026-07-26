const MASK_64 = (1n << 64n) - 1n;

const ROTATION = [
  1, 3, 6, 10, 15, 21, 28, 36, 45, 55, 2, 14,
  27, 41, 56, 8, 25, 43, 62, 18, 39, 61, 20, 44,
] as const;

const PERMUTATION = [
  10, 7, 11, 17, 18, 3, 5, 16, 8, 21, 24, 4,
  15, 23, 19, 13, 12, 2, 20, 14, 22, 9, 6, 1,
] as const;

const ROUND_CONSTANTS = [
  0x0000000000000001n, 0x0000000000008082n, 0x800000000000808an,
  0x8000000080008000n, 0x000000000000808bn, 0x0000000080000001n,
  0x8000000080008081n, 0x8000000000008009n, 0x000000000000008an,
  0x0000000000000088n, 0x0000000080008009n, 0x000000008000000an,
  0x000000008000808bn, 0x800000000000008bn, 0x8000000000008089n,
  0x8000000000008003n, 0x8000000000008002n, 0x8000000000000080n,
  0x000000000000800an, 0x800000008000000an, 0x8000000080008081n,
  0x8000000000008080n, 0x0000000080000001n, 0x8000000080008008n,
] as const;

function rotateLeft(value: bigint, shift: number) {
  const amount = BigInt(shift);
  return ((value << amount) | (value >> (64n - amount))) & MASK_64;
}

function keccakF(state: bigint[]) {
  const c = new Array<bigint>(5).fill(0n);
  const d = new Array<bigint>(5).fill(0n);

  for (let round = 0; round < 24; round += 1) {
    for (let x = 0; x < 5; x += 1) {
      c[x] = state[x] ^ state[x + 5] ^ state[x + 10] ^ state[x + 15] ^ state[x + 20];
    }
    for (let x = 0; x < 5; x += 1) {
      d[x] = c[(x + 4) % 5] ^ rotateLeft(c[(x + 1) % 5], 1);
    }
    for (let index = 0; index < 25; index += 1) state[index] = (state[index] ^ d[index % 5]) & MASK_64;

    let current = state[1];
    for (let index = 0; index < 24; index += 1) {
      const target = PERMUTATION[index];
      const displaced = state[target];
      state[target] = rotateLeft(current, ROTATION[index]);
      current = displaced;
    }

    for (let row = 0; row < 25; row += 5) {
      const rowValues = state.slice(row, row + 5);
      for (let x = 0; x < 5; x += 1) {
        state[row + x] = (rowValues[x] ^ ((~rowValues[(x + 1) % 5]) & rowValues[(x + 2) % 5])) & MASK_64;
      }
    }
    state[0] = (state[0] ^ ROUND_CONSTANTS[round]) & MASK_64;
  }
}

function utf8Bytes(value: string) {
  return new TextEncoder().encode(value);
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function hexToBytes(hexValue: string) {
  const normalized = hexValue.startsWith("0x") ? hexValue.slice(2) : hexValue;
  if (normalized.length % 2) throw new Error("Hex values must contain complete bytes.");
  const bytes = new Uint8Array(normalized.length / 2);
  for (let index = 0; index < bytes.length; index += 1) bytes[index] = Number.parseInt(normalized.slice(index * 2, index * 2 + 2), 16);
  return bytes;
}

export function keccak256Bytes(input: Uint8Array) {
  const rateBytes = 136;
  const paddedLength = Math.ceil((input.length + 1) / rateBytes) * rateBytes;
  const padded = new Uint8Array(paddedLength);
  padded.set(input);
  padded[input.length] = 0x01;
  padded[paddedLength - 1] |= 0x80;

  const state = new Array<bigint>(25).fill(0n);
  for (let offset = 0; offset < padded.length; offset += rateBytes) {
    for (let lane = 0; lane < rateBytes / 8; lane += 1) {
      let value = 0n;
      for (let byte = 0; byte < 8; byte += 1) value |= BigInt(padded[offset + lane * 8 + byte]) << BigInt(byte * 8);
      state[lane] ^= value;
    }
    keccakF(state);
  }

  const output = new Uint8Array(32);
  for (let index = 0; index < output.length; index += 1) {
    output[index] = Number((state[Math.floor(index / 8)] >> BigInt((index % 8) * 8)) & 0xffn);
  }
  return output;
}

export function keccak256(value: string | Uint8Array) {
  return `0x${bytesToHex(keccak256Bytes(typeof value === "string" ? utf8Bytes(value) : value))}` as `0x${string}`;
}

export function functionSelector(signature: string) {
  return keccak256(signature).slice(0, 10) as `0x${string}`;
}

export function eventTopic(signature: string) {
  return keccak256(signature);
}
