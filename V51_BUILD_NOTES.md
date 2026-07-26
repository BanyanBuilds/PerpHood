# V51 Build Notes

## Milestone

Compiler-backed chain assault and stale-quote protection above the V50 exact settlement and invariant layer.

## Added

- Deadline and slippage errors in the BattlePool and account router
- Protected direct wallet Buy, Sell, Long, Short, and Close methods
- Protected internal-account Long, Short, and Close methods
- Protected authorized-session Long, Short, and Close methods
- Fresh quote binding in direct terminal execution
- Fresh quote binding in relayed session execution
- Fill-time quote refresh in the V46 keeper
- Maximum short borrowed-inventory protection
- Minimum short locked-proceeds protection
- Minimum position-close payout protection
- Eleven-test hostile Solidity assault contract
- Foundry `assault` profile
- Automated Forge/Anvil/Cast toolchain probe
- Automated Anvil deposit/trade/rollback/invariant lifecycle
- `/admin/chain-assault` operations console

## Compatibility retained

- V50 settlement math and formal-invariant model
- V48 in-place Markets/Movers quick presets
- No Markets/Movers trading sidecar
- Three simultaneous left utility/research sidecars
- V47 canonical indexing and recovery
- V46 durable orders and keeper leasing
- V45 bounded sessions and custody ledger
- V43 shared BattlePool settlement

## Execution policy

Current terminal and keeper paths use protected methods. Legacy unbounded contract methods remain only to preserve historical fixtures and compatibility; they must not be exposed as production UI actions.
