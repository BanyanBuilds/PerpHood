import { readFileSync } from "node:fs";

let passed = 0;
function check(label: string, condition: boolean) {
  if (!condition) throw new Error(`V67 control failed: ${label}`);
  passed += 1;
}

const v65 = readFileSync("contracts/src/LeverageXLaunchFactoryV65.sol", "utf8");
const admin = readFileSync("app/admin/page.tsx", "utf8");
const v54Test = readFileSync("contracts/test/PerpHoodLaunchFactoryV54.t.sol", "utf8");
const v55Test = readFileSync("contracts/test/LeverageXLaunchFactoryV55.t.sol", "utf8");
const gate = readFileSync("scripts/v67-contract-compile-gate.mts", "utf8");

check("Waves icon imported", /ShieldCheck, Waves, Workflow/.test(admin));
check("V65 mixed tuple declaration removed", !v65.includes("(positionId,, uint256 amount0, uint256 amount1)"));
check("V65 amount0 declared before tuple", v65.includes("uint256 amount0;\n        uint256 amount1;\n        (positionId,, amount0, amount1)"));
check("factory address checksummed", v65.includes("0x1f7d7550B1b028f7571E69A784071F0205FD2EfA"));
check("position manager checksummed", v65.includes("0x73991a25C818Bf1f1128dEAaB1492D45638DE0D3"));
check("router checksummed", v65.includes("0xCaf681a66D020601342297493863E78C959E5cb2"));
check("quoter checksummed", v65.includes("0x33e885eD0Ec9bF04EcfB19341582aADCb4c8A9E7"));
check("V54 test uses implemented error", !v54Test.includes("ZeroGenesisBuy.selector") && v54Test.includes("InvalidGenesisBuy.selector"));
check("V55 test uses implemented error", !v55Test.includes("ZeroGenesisBuy.selector") && v55Test.includes("InvalidGenesisBuy.selector"));
check("Windows npm command supported", gate.includes('command === "npm" ? "npm.cmd"'));
check("V67 report path configured", gate.includes("v67-contract-compile-gate.json"));

console.log(`Leverage X V67 contract-compile controls passed ${passed}/11.`);
