import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const files = {
  package: await readFile("package.json", "utf8"),
  chain: await readFile("lib/server/v48-chain-config.ts", "utf8"),
  rpc: await readFile("lib/server/v48-rpc-pool.ts", "utf8"),
  db: await readFile("lib/server/v48-database.ts", "utf8"),
  materializer: await readFile("lib/server/v48-materializer.ts", "utf8"),
  stream: await readFile("app/api/v48/stream/route.ts", "utf8"),
  console: await readFile("components/V48DataPlaneConsole.tsx", "utf8"),
  provider: await readFile("components/MarketProvider.tsx", "utf8"),
  supabase: await readFile("supabase/v48_data_plane.sql", "utf8"),
  env: await readFile(".env.example", "utf8"),
  css: await readFile("app/globals.css", "utf8"),
};
assert.match(files.package, /perphood-v48-live-data-plane|perphood-v49-settlement-math-verification|perphood-v50-formal-invariants|perphood-v51-compiler-chain-assault|perphood-v52-product-completion|perphood-v53-supabase-user-state/);
assert.match(files.package, /test:v48/);
assert.match(files.chain, /chainId: 4_663/);
assert.match(files.chain, /0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73/);
assert.match(files.rpc, /RPC quorum failed/);
assert.match(files.rpc, /v48FailoverRequest/);
assert.match(files.db, /market_candles/);
assert.match(files.db, /data_plane_events/);
assert.match(files.db, /system_alerts/);
assert.match(files.materializer, /\[1, 15, 30\]/);
assert.match(files.materializer, /volume60sWei/);
assert.match(files.stream, /text\/event-stream/);
assert.match(files.stream, /last-event-id/);
assert.match(files.console, /Live Data Plane/);
assert.match(files.console, /Run data plane/);
assert.match(files.provider, /new EventSource\("\/api\/v48\/stream"\)/);
assert.match(files.provider, /5_000/);
assert.match(files.supabase, /service-role/);
assert.match(files.supabase, /perphood_v48_market_candles/);
assert.match(files.env, /V48_RPC_QUORUM/);
assert.match(files.env, /V48_SUPABASE_SERVICE_ROLE_KEY/);
const v48Css = files.css.slice(files.css.indexOf("/* V48 live data plane */"));
assert.doesNotMatch(v48Css, /font-size:(?:9|10)px/);
console.log("V48 static integration smoke passed: official chain configuration, RPC quorum/failover, durable SSE, indexed candles, terminal subscription, readable operations UI, backup controls, and Postgres replica schema.");
