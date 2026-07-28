import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { materializeV87LiveEvents, readV87LiveState } from "../lib/server/v87-live-state-store.ts";
const dir=mkdtempSync(join(tmpdir(),"lx-v87-")); const db=join(dir,"state.sqlite");
const market="0x1111111111111111111111111111111111111111"; const token="0x2222222222222222222222222222222222222222"; const owner="0x3333333333333333333333333333333333333333";
const base={chainId:46630,marketAddress:market,occurredAt:new Date().toISOString()};
const events=[
 {...base,id:"e1",kind:"TOKEN_CREATED",blockNumber:1,payload:{tokenAddress:token,creatorAddress:owner,metadataHash:"abc"}},
 {...base,id:"e2",kind:"MARKET_ENABLED",blockNumber:2,payload:{active:true,phase:2}},
 {...base,id:"e3",kind:"TRADE_EXECUTED",blockNumber:3,payload:{side:"BUY",grossWethWei:"100",marketCapEthWad:"900"}},
 {...base,id:"e4",kind:"PRICE_UPDATED",blockNumber:4,payload:{marginalPriceWad:"10",marketCapEthWad:"1000",openInterestLongWei:"500",openInterestShortWei:"200",activePositions:"1"}},
 {...base,id:"e5",kind:"POSITION_OPENED",blockNumber:5,payload:{positionId:"7",ownerAddress:owner,direction:"LONG",leverage:10,collateralWei:"50",notionalWei:"500",entryPriceWad:"10",liquidationPriceWad:"9"}},
];
const first=materializeV87LiveEvents(events,db); assert.equal(first.applied,5); assert.equal(first.duplicates,0);
const replay=materializeV87LiveEvents(events,db); assert.equal(replay.applied,0); assert.equal(replay.duplicates,5);
let state=readV87LiveState({chainId:46630,databasePath:db}); assert.equal(state.markets.length,1); assert.equal(state.markets[0].tradeCount,1); assert.equal(state.markets[0].buyVolumeWei,"100"); assert.equal(state.markets[0].lastPriceWad,"10"); assert.equal(state.positions[0].status,"OPEN");
materializeV87LiveEvents([{...base,id:"e6",kind:"POSITION_CLOSED",blockNumber:6,payload:{positionId:"7",ownerAddress:owner,liquidated:false,payoutWei:"70",pnlWei:"20",badDebtWei:"0"}}],db);
state=readV87LiveState({chainId:46630,databasePath:db,includeClosed:true}); assert.equal(state.positions[0].status,"CLOSED"); assert.equal(state.positions[0].pnlWei,"20");
const openOnly=readV87LiveState({chainId:46630,databasePath:db}); assert.equal(openOnly.positions.length,0);
rmSync(dir,{recursive:true,force:true}); console.log("V87 persistent live state smoke passed: durable snapshots, replay idempotency, trade aggregation and position lifecycle.");
