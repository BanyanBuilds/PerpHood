import assert from "node:assert/strict";
import { encodeBytes32, encodeUint, type Hex } from "../lib/chain/abi.ts";
import { decodeV24RuntimeState } from "../lib/chain/v24-battle-client.ts";

const word = (value: bigint | number) => encodeUint(value);
const hash = (byte: string) => `0x${byte.repeat(64)}` as Hex;
const runtime = `0x${[
  word(12), word(2_000_000_000), encodeBytes32(hash("1")), word(3), word(250_000_001), word(250_000_001_000_000_000n),
  word(2n * 10n ** 18n), word(999_000_000n * 10n ** 18n), word(10n ** 17n), word(1_000_000n * 10n ** 18n),
  word(5n * 10n ** 17n), word(2n * 10n ** 17n), encodeBytes32(hash("2")), encodeBytes32(hash("3")), encodeBytes32(hash("4")),
  word(19n * 10n ** 17n), word(1),
].join("")}` as Hex;
const state = decodeV24RuntimeState(runtime, "0x2a", 0.42);
assert.equal(state.sequence, 12);
assert.equal(state.curveSoldTokenWad, 1_000_000n * 10n ** 18n);
assert.equal(state.availablePoolWethWad, 19n * 10n ** 17n);
assert.equal(state.custodySolvent, true);
assert.equal(state.blockNumber, 42n);
assert.equal(state.rpcLatencyMs, 0.42);
console.log("V24 runtime decoder mapped the 17-word contract snapshot, curve state, and custody authority correctly.");
