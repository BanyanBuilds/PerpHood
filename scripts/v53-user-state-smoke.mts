import assert from "node:assert/strict";
import {
  EMPTY_V53_USER_STATE,
  getV53UserStateSection,
  mergeV53UserState,
  normalizeV53UserState,
  setV53UserStateSection,
  validateV53RecoveryKey,
} from "../lib/v53-user-state.ts";

const base = setV53UserStateSection(EMPTY_V53_USER_STATE, "watchlist-v1", ["hood"], 100);
const local = setV53UserStateSection(base, "liked-tokens-v1", ["alpha"], 300);
const remote = setV53UserStateSection(base, "liked-tokens-v1", ["beta"], 200);
const remoteWorkspace = setV53UserStateSection(remote, "terminal-layout-v1", { openPanels: ["watchlist", "wallets", "x-launch-feed"] }, 400);
const merged = mergeV53UserState(remoteWorkspace, local);

assert.deepEqual(getV53UserStateSection(merged, "watchlist-v1", []), ["hood"]);
assert.deepEqual(getV53UserStateSection(merged, "liked-tokens-v1", []), ["alpha"], "Newest section timestamp must win.");
assert.deepEqual(getV53UserStateSection(merged, "terminal-layout-v1", {}), { openPanels: ["watchlist", "wallets", "x-launch-feed"] });
assert.equal(setV53UserStateSection(merged, "liked-tokens-v1", ["alpha"], 999), merged, "No-op writes must retain object identity.");
assert.equal(normalizeV53UserState({ version: 999, sections: { bad: { updatedAt: "nope", value: 1 } } }).version, 53);
assert.equal(validateV53RecoveryKey(`ph53_${"A".repeat(43)}`), true);
assert.equal(validateV53RecoveryKey("ph53_short"), false);
assert.throws(() => setV53UserStateSection(merged, "", true), /cannot be empty/);
assert.throws(() => setV53UserStateSection(merged, "x".repeat(161), true), /cannot exceed/);
assert.throws(() => setV53UserStateSection(merged, "invalid-value", undefined), /JSON serializable/);

console.log("V53 user-state smoke passed: section-level conflict resolution, no-op suppression, normalization, workspace persistence and recovery-key validation.");
