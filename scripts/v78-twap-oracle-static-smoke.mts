import { readFileSync } from "node:fs";
const p="contracts/twap-oracle-src/LeverageXUniswapV3TwapOracleV78.sol";
const s=readFileSync(p,"utf8");
const required=["observe(secondsAgos)","MIN_TWAP_WINDOW","maxSpotDeviationBps","minPoolLiquidity","SpotDeviationTooHigh","ObservationUnavailable","TickMathV78","FullMathV78","wrappedNative","registry.market(token)"];
for(const marker of required){if(!s.includes(marker)) throw new Error(`V78 missing ${marker}`);}
if(s.includes("tx.origin")) throw new Error("V78 must not use tx.origin");
console.log("V78 TWAP oracle static smoke passed.");
