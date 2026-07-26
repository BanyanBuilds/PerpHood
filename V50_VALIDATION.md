# V50 Validation

## Executed in this environment

- V50 adversarial exact-math suite
- V50 stateful reference-engine suite
- V50 static contract/client/UI integration checks
- TypeScript/TSX syntax scan
- Every constituent test in the inherited V21–V49 dependency-free regression chain
- ZIP integrity and SHA-256 generation

The outer `npm run test:v50` wrapper was executed twice, but the container tool stopped each run at its wall-clock limit before the wrapper could return a final exit code. No failing assertion remained. The first run exposed and led to correction of two stale V44/V45 version allowlists. The second run passed through the inherited suites until the execution window ended. Every unprinted remaining V48, V49, and V50 constituent suite was then run directly and passed; all results are preserved in `V50_TEST_LOG.txt`.

## V50 focused results

- Fee-fragmentation vectors: 96
- Oscillation cycles: 500
- Last-short floor payout: 508,918,767,753,352,682 wei
- Last-short floor PNL: 458,918,767,753,352,682 wei
- Random mixed portfolios: 48
- Exhaustive close permutations: 5,760
- Stateful seeds: 64
- Actions per seed: 384
- Stateful attempted actions: 24,576
- Stateful executed actions: 24,080
- Safely rejected actions: 496
- Liquidations processed: 2,747
- Maximum simultaneous active positions observed: 20
- Maximum guaranteed obligations observed: 3.2571270399423304 ETH
- V50 static checks: 11/11
- TypeScript/TSX files parsed: 268

## Inherited safety results retained

- 18,750 randomized BattlePool actions from the inherited engine fuzz campaign
- 40-position 20× long liquidation cascade
- 40-position 20× short liquidation cascade
- Zero bad debt in both controlled cascades
- Exact one-billion-token conservation
- V43 shared settlement, V44 receipts, V45 custody/sessions, V46 keepers, V47 rollback/replay, V48 data plane and preset/sidecar rules, and V49 exact settlement verification

## Not executed here

- `forge test`
- the V50 Foundry invariant campaign
- Solidity compilation
- production Next.js build
- injected-wallet browser E2E
- test-chain load testing
- Echidna, Medusa, symbolic execution, or external formal-verification tools

Those checks require Foundry, installed project dependencies, and a live local/test-chain environment. V50 remains unaudited reference software and is not approved for public funds.
