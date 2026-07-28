import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { openV47Database } from "../lib/server/v47-database.ts";
import { deliverBridgeBatch, readBridgeCursor } from "../lib/server/v86-chain-live-bridge.ts";

const dir = mkdtempSync(join(tmpdir(), "lx-v86-"));
const path = join(dir, "index.sqlite");
const db = openV47Database(path);
const chainId = 46630;
const tx = `0x${"ab".repeat(32)}`;
const market = `0x${"11".repeat(20)}`;
const token = `0x${"22".repeat(20)}`;
const creator = `0x${"33".repeat(20)}`;
try {
  db.prepare(`INSERT INTO markets(chain_id,market_address,token_address,creator_address,metadata_hash,creator_genesis_buy_wei,migration_target_usd_wad,created_block,created_transaction_hash,active,phase)
    VALUES(?,?,?,?,?,?,?,?,?,1,0)`).run(chainId,market,token,creator,`0x${"44".repeat(32)}`,"1000","500000000000000000000",10,tx);
  db.prepare(`INSERT INTO raw_events(chain_id,transaction_hash,log_index,block_number,block_hash,address,topic0,topics_json,data,event_name,removed,indexed_at)
    VALUES(?,?,?,?,?,?,?,?,?,'MarketCreated',0,?)`).run(chainId,tx,0,10,`0x${"55".repeat(32)}`,market,`0x${"66".repeat(32)}`,"[]","0x",Date.now());
} finally { db.close(); }

let body: unknown;
const result = await deliverBridgeBatch({
  databasePath: path,
  destination: "https://example.test/api/live/ingest",
  secret: "x".repeat(32),
  chainId,
  fetchImpl: async (_url, init) => {
    body = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  },
});
assert.equal(result.scanned, 1);
assert.equal(result.delivered, 1);
assert.equal((body as Array<{kind:string}>)[0].kind, "TOKEN_CREATED");
const verify = openV47Database(path);
try { assert.equal(readBridgeCursor(verify,"https://example.test/api/live/ingest",chainId).blockNumber,10);
  assert.equal(readBridgeCursor(verify,"https://example.test/api/live/ingest",chainId).logIndex,0); }
finally { verify.close(); }

let failed = false;
try {
  const db2 = openV47Database(path);
  db2.prepare("UPDATE v86_live_bridge_cursor SET block_number=-1,log_index=-1").run();
  db2.close();
  await deliverBridgeBatch({ databasePath:path,destination:"https://example.test/api/live/ingest",secret:"x".repeat(32),chainId,fetchImpl:async()=>new Response("no",{status:500}) });
} catch { failed = true; }
assert.equal(failed,true);
const verifyFailure = openV47Database(path);
try { assert.equal(readBridgeCursor(verifyFailure,"https://example.test/api/live/ingest",chainId).blockNumber,-1);
  assert.equal(readBridgeCursor(verifyFailure,"https://example.test/api/live/ingest",chainId).logIndex,-1); }
finally { verifyFailure.close(); }
rmSync(dir,{recursive:true,force:true});
console.log("PASS: V47 rows map to strict V85 live events");
console.log("PASS: delivery advances durable cursor only after HTTP success");
console.log("PASS: failed delivery is retried without event loss");
console.log("V86 chain-to-live bridge smoke passed.");
