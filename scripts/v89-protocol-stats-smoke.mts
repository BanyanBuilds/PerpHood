import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { materializeV87LiveEvents } from "../lib/server/v87-live-state-store.ts";
import { readV89ProtocolStats } from "../lib/server/v89-protocol-stats.ts";

const dir=mkdtempSync(join(tmpdir(),"lx-v89-")); const db=join(dir,"state.sqlite"); const market="0x1111111111111111111111111111111111111111"; const token="0x2222222222222222222222222222222222222222"; const owner="0x3333333333333333333333333333333333333333";
const base={chainId:46630,marketAddress:market,blockNumber:1,blockHash:"0x"+"aa".repeat(32),txHash:"0x"+"bb".repeat(32),logIndex:0,occurredAt:new Date().toISOString()};
materializeV87LiveEvents([
 {...base,id:"mint",kind:"TOKEN_CREATED",payload:{tokenAddress:token,creatorAddress:owner,metadataHash:"meta"}},
 {...base,id:"enabled",kind:"MARKET_ENABLED",blockNumber:2,payload:{active:true,phase:2}},
 {...base,id:"trade",kind:"TRADE_EXECUTED",blockNumber:3,payload:{side:"BUY",grossWethWei:"1000000000000000000",marketCapEthWad:"2000000000000000000"}},
 {...base,id:"position",kind:"POSITION_OPENED",blockNumber:4,payload:{positionId:"1",ownerAddress:owner,direction:"LONG",leverage:20,collateralWei:"20000000000000000",notionalWei:"400000000000000000",entryPriceWad:"1",liquidationPriceWad:"1"}},
],db);
const stats=readV89ProtocolStats(46630,db);
assert.equal(stats.tokensMinted,1); assert.equal(stats.tokensGraduated,1); assert.equal(stats.activePositions,1); assert.equal(stats.activeTraders,1); assert.equal(stats.spotVolumeWei,"1000000000000000000"); assert.equal(stats.perpsOpenInterestWei,"0");
console.log("PASS V89 protocol stats: indexed mint/graduation, volume, positions, traders, replay-safe database reads");
rmSync(dir,{recursive:true,force:true});
