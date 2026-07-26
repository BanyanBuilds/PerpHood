import assert from "node:assert/strict";
import { eventTopic, functionSelector, keccak256 } from "../lib/chain/keccak.ts";

assert.equal(
  keccak256(new Uint8Array()),
  "0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470",
  "empty Keccak-256 vector",
);
assert.equal(functionSelector("transfer(address,uint256)"), "0xa9059cbb", "ERC-20 transfer selector");
assert.equal(functionSelector("balanceOf(address)"), "0x70a08231", "ERC-20 balance selector");
assert.equal(
  eventTopic("Transfer(address,address,uint256)"),
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
  "ERC-20 Transfer topic",
);
console.log("V21 Keccak and selector vectors passed.");
