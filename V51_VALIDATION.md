# V51 Validation

## Result

**Portable V21–V51 constituent suites: PASS**

The monolithic `npm run test:v51` command ran through the inherited V48 suites before the execution tool reached its ten-minute wall-clock limit. The remaining V49, V50, V51, and final syntax suites were then run directly with unchanged coverage and passed. `V51_TEST_LOG.txt` contains both portions.

## V51 focused checks

- Ordering-assault model: PASS
- Static contract/application integration: **19/19**
- TypeScript/TSX syntax: **274 files**
- Toolchain probe: completed
- Forge available: **No**
- Anvil available: **No**
- Cast available: **No**

## Packaged Solidity campaign

`LaunchpadFactoryV51Assault.t.sol` defines **11** hostile compiled-contract tests:

1. Stale direct buy rollback
2. Stale long rollback
3. Stale short maximum-borrow protection
4. Stale close minimum-payout protection
5. Expired deadline rollback
6. Market sell reentrancy
7. Router withdrawal reentrancy
8. Rejecting payout receiver rollback
9. Forced ETH surplus isolation
10. Creator protected-perps rejection
11. Core action gas ceilings

These tests were source-integrated and statically checked, but not compiled or executed in this environment because Foundry was unavailable.

## Inherited mathematical evidence retained

### V50 stateful campaign

- 64 deterministic seeds
- 384 steps per seed
- 24,576 attempted transitions
- 24,080 executed transitions
- 496 unsafe transitions rejected
- 2,747 liquidations
- Maximum 20 simultaneous positions
- Maximum protected obligations: 3.2571270399423304 ETH

### V50 adversarial settlement

- 96 fee-fragmentation vectors
- 500 oscillation cycles
- 48 mixed-position portfolios
- 5,760 close-order permutations
- Last-short floor payout and profit bounded by notional and reserves

### V49 exact settlement

- 3,001 exact-rational curve vectors
- 20 short-floor scenarios
- 24 close-order permutations
- No cross-position liability netting

### Long-running inherited BattlePool campaign

- 18,750 randomized actions
- 40 simultaneous 20× long liquidations
- 40 simultaneous 20× short liquidations
- Zero bad debt in controlled cascades
- Exact one-billion-token conservation

## Not executed here

- Solidity compilation
- `forge test`
- Extended Foundry invariant campaign
- Anvil lifecycle
- Cast verification
- Gas snapshot generation
- Next.js production build
- Browser wallet E2E
- Independent audit

The absence of these results is shown directly in `/admin/chain-assault` and `public/local-chain/v51-toolchain.json`.
