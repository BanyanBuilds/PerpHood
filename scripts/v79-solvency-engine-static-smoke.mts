import { readFileSync, existsSync } from "node:fs";
const file="contracts/solvency-engine-src/LeverageXSolvencyPositionEngineV79.sol";
if(!existsSync(file)) throw new Error(`Missing ${file}`);
const s=readFileSync(file,"utf8");
for(const needle of ["insuranceReserveWei","maxLongOiWei","maxShortOiWei","maxTotalOiWei","maxSkewBps","minInsuranceWei","protectedLiabilitiesWei","freeSurplusWei","solvencyRatioBps","OpenInterestCap","InsuranceFloor","SolvencyCheckpoint"]){ if(!s.includes(needle)) throw new Error(`Missing solvency control: ${needle}`); }
console.log("V79 static solvency controls: PASS");
