import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { validateV85Event } from "../lib/v85-live-data.ts";

const source = await readFile(new URL("../lib/v85-live-data.ts", import.meta.url), "utf8");
assert.match(source, /const chainId = Number\(value\.chainId\);/);
assert.match(source, /createV85EventId\(value\.kind, chainId,/);
assert.doesNotMatch(source, /createV85EventId\(value\.kind, value\.chainId,/);

const event = validateV85Event({
  kind: "TOKEN_CREATED",
  chainId: 4663,
  payload: { tokenAddress: "0x0000000000000000000000000000000000000001" },
});
assert.equal(event.chainId, 4663);
assert.match(event.id, /^4663:/);
assert.throws(() => validateV85Event({ kind: "TOKEN_CREATED", payload: {} }), /chainId/);
console.log("V94 strict live-event type smoke passed.");
