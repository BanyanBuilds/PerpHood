# V93 — Ethers Contract Type Safety

V93 removes the remaining direct ABI method calls from the V81 deployment verifier. Contracts created with a runtime ABI are typed as `BaseContract` by Ethers v6, so methods such as `locker.owner()` and `factory.launchesOpen()` can fail strict Next.js type checking.

All runtime-ABI reads now route through `contract.getFunction(name)()`. The existing `bindFactory` write remains routed through `getFunction`. This changes TypeScript dispatch only; it does not change deployed contracts, transaction behavior, launch rules, BattlePool behavior, or protocol economics.

Run `npm run test:v93` to guard against reintroducing direct dynamic contract calls.
