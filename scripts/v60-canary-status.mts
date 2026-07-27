import { V60_CANARY_CREATOR, factoryAddress, marketSnapshot, snapshot } from "./v60-canary-common.mts";
const factory = factoryAddress();
const state = snapshot(factory);
console.log(JSON.stringify({ version: "V60", creator: V60_CANARY_CREATOR, factory: state, market: state.firstMarket ? marketSnapshot(factory, state.firstMarket) : null }, (_key, value) => typeof value === "bigint" ? value.toString() : value, 2));
