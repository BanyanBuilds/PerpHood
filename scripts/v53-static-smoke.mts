import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const files = {
  provider: await readFile("components/UserStateProvider.tsx", "utf8"),
  server: await readFile("lib/server/v53-user-state-server.ts", "utf8"),
  route: await readFile("app/api/v53/user-state/route.ts", "utf8"),
  schema: await readFile("supabase/v53_user_state.sql", "utf8"),
  terminal: await readFile("components/TerminalHub.tsx", "utf8"),
  markets: await readFile("components/MarketProvider.tsx", "utf8"),
  alerts: await readFile("components/MarketAlertCenter.tsx", "utf8"),
  profile: await readFile("components/ProfileMenu.tsx", "utf8"),
  layout: await readFile("app/layout.tsx", "utf8"),
};

assert.match(files.layout, /UserStateProvider/);
assert.match(files.provider, /perphood-v53-recovery-key/);
assert.match(files.provider, /mergeV53UserState/);
assert.match(files.provider, /local-only/);
assert.match(files.server, /SUPABASE_SERVICE_ROLE_KEY/);
assert.match(files.server, /V53_USER_STATE_ENABLED/);
assert.doesNotMatch(files.provider, /SUPABASE_SERVICE_ROLE_KEY/);
assert.match(files.server, /MAX_STATE_BYTES/);
assert.match(files.server, /identityFromRecoveryKey/);
assert.match(files.server, /x-perphood-sync-key/);
assert.match(files.route, /DEVICE_ID_PATTERN/);
assert.match(files.route, /MAX_REQUEST_BYTES/);
assert.match(files.schema, /perphood_v53_user_state/);
assert.match(files.schema, /security definer/);
assert.match(files.schema, /revoke all on function/);
assert.match(files.schema, /on conflict \(profile_id\) do nothing/);
assert.match(files.schema, /get diagnostics v_inserted = row_count/);
assert.match(files.schema, /settings only/i);
assert.match(files.terminal, /terminal-layout-v1/);
assert.match(files.terminal, /liked-tokens-v1/);
assert.match(files.terminal, /MAX_LEFT_DOCK_PANELS = 3/);
assert.match(files.markets, /watchlist-v1/);
assert.match(files.alerts, /market-alerts-v1/);
assert.match(files.profile, /cannot move funds, sign trades, or withdraw assets/);

console.log("V53 static integration smoke passed: settings-only Supabase sync, recovery-key API, local fallback, presets/workspaces/watchlists/likes/alerts integration and three-left-sidecar retention.");
