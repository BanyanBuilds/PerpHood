import { readFileSync } from "node:fs";
import { resolve } from "node:path";
export * from "./v59-mainnet-common.mts";
import { DEFAULT_DEPLOYER, hexToBigInt, normalizeAddress, rpcRequest, run, toRpcHex } from "./v59-mainnet-common.mts";

export const V65_NETWORK={name:"Robinhood Chain Mainnet",chainId:4663,explorer:"https://robinhoodchain.blockscout.com",blockscoutApi:"https://robinhoodchain.blockscout.com/api/"} as const;
export const V65_TARGETS={
 locker:"contracts/src/LeverageXLaunchFactoryV65.sol:LeverageXPermanentLiquidityLockerV65",
 factory:"contracts/src/LeverageXLaunchFactoryV65.sol:LeverageXLaunchFactoryV65",
 token:"contracts/src/LeverageXLaunchFactoryV65.sol:LeverageXTokenV65",
} as const;
export const V65_DEX={
 wrappedNative:"0x0bd7d308f8e1639fab988df18a8011f41eacad73",
 factory:"0x1f7d7550b1b028f7571e69a784071f0205fd2efa",
 positionManager:"0x73991a25c818bf1f1128deaab1492d45638de0d3",
 swapRouter02:"0xcaf681a66d020601342297493863e78c959e5cb2",
 quoterV2:"0x33e885ed0ec9bf04ecfb19341582aadcb4c8a9e7",
 fee:10000,
} as const;
export const V65_EXPECTED_DEPLOYER=normalizeAddress(process.env.V65_EXPECTED_DEPLOYER_ADDRESS,"V65_EXPECTED_DEPLOYER_ADDRESS",DEFAULT_DEPLOYER);

export const V65_MIN_TOTAL_LAUNCH_BUDGET_WEI = 1_000_000_000_000_000n;
export const V65_MIN_CREATOR_GENESIS_BUY_WEI = 1_000_000_000_000n;
export const V65_DEFAULT_FIRST_TOKEN_TOTAL_BUDGET_WEI = V65_MIN_TOTAL_LAUNCH_BUDGET_WEI;

export type V65CliLaunchBudget = {
 totalBudgetWei: bigint;
 gasEstimate: bigint;
 gasLimit: bigint;
 gasPriceWei: bigint;
 maximumGasCostWei: bigint;
 creatorBuyWei: bigint;
};

export async function estimateV65CliLaunchBudget(input: {
 rpc: string;
 factory: string;
 creator: string;
 name: string;
 symbol: string;
 metadataUri: string;
 metadataHash: string;
 totalBudgetWei: bigint;
}): Promise<V65CliLaunchBudget> {
 if (input.totalBudgetWei < V65_MIN_TOTAL_LAUNCH_BUDGET_WEI) {
  throw new Error("V65_FIRST_TOKEN_TOTAL_BUDGET_WEI must be at least 0.001 ETH and already includes the gas ceiling.");
 }
 const data = run("cast", [
  "calldata",
  "createToken(string,string,string,bytes32)",
  input.name,
  input.symbol,
  input.metadataUri,
  input.metadataHash,
 ]);
 const gasPriceWei = hexToBigInt(await rpcRequest<string>(input.rpc, "eth_gasPrice"));
 let creatorBuyWei = input.totalBudgetWei / 2n;
 let gasEstimate = 0n;
 let gasLimit = 0n;
 let maximumGasCostWei = 0n;
 for (let pass = 0; pass < 4; pass += 1) {
  gasEstimate = hexToBigInt(await rpcRequest<string>(input.rpc, "eth_estimateGas", [{
   from: input.creator,
   to: input.factory,
   data,
   value: toRpcHex(creatorBuyWei),
  }]));
  gasLimit = gasEstimate * 130n / 100n + 20_000n;
  maximumGasCostWei = gasLimit * gasPriceWei;
  if (maximumGasCostWei >= input.totalBudgetWei) {
   throw new Error("Current Robinhood Chain gas leaves no safe creator buy inside the selected total launch budget.");
  }
  const nextCreatorBuyWei = input.totalBudgetWei - maximumGasCostWei;
  if (nextCreatorBuyWei == creatorBuyWei) break;
  creatorBuyWei = nextCreatorBuyWei;
 }
 if (creatorBuyWei < V65_MIN_CREATOR_GENESIS_BUY_WEI) {
  throw new Error("The live gas ceiling leaves less than the minimum creator genesis buy. Increase the total launch budget or retry when gas is lower.");
 }
 return { totalBudgetWei: input.totalBudgetWei, gasEstimate, gasLimit, gasPriceWei, maximumGasCostWei, creatorBuyWei };
}
export function v65WalletArgs(){
 const account=process.env.V65_KEYSTORE_ACCOUNT?.trim()||process.env.V59_KEYSTORE_ACCOUNT?.trim();
 const password=process.env.V65_KEYSTORE_PASSWORD_FILE?.trim()||process.env.V59_KEYSTORE_PASSWORD_FILE?.trim();
 const privateKey=process.env.V65_DEPLOYER_PRIVATE_KEY?.trim()||process.env.V59_DEPLOYER_PRIVATE_KEY?.trim();
 if(account){const args=["--account",account];if(password)args.push("--password-file",password);return{args,redactions:[password??""],mode:"keystore" as const,expectedAddress:V65_EXPECTED_DEPLOYER};}
 if(privateKey){if(!/^0x[0-9a-fA-F]{64}$/.test(privateKey))throw new Error("V65_DEPLOYER_PRIVATE_KEY must be 32-byte hex.");return{args:["--private-key",privateKey],redactions:[privateKey],mode:"private-key" as const,expectedAddress:V65_EXPECTED_DEPLOYER};}
 throw new Error("Configure V65_KEYSTORE_ACCOUNT (preferred) or V65_DEPLOYER_PRIVATE_KEY only in .env.mainnet.local.");
}
export function readV65Manifest(){return JSON.parse(readFileSync(resolve("deployments","leveragex-v65-mainnet.json"),"utf8")) as any;}
