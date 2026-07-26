# PERPHOOD V45 Validation

## Result

`npm run test:v45` passed on July 25, 2026.

## Executed successfully

- Entire inherited V21–V44 regression chain
- 18,750 randomized BattlePool actions
- Existing long/short cascade and conservation suites
- V43 unified BattlePool contract/static checks
- V44 receipt and terminal reconciliation checks
- V45 internal account-ledger model
- Deposit, withdrawal, ETH liability, and token liability invariants
- Session expiry, nonce, replay, action bitmap, per-intent cap, and cumulative cap model
- P-256 canonical intent signing and tamper rejection
- V45 Solidity structural/static checks
- Market-payout single-credit guard check
- No `tx.origin` authorization
- Creator perps restriction retained
- V45 terminal, Funding, relay, deployment, and sandbox integration checks: 16/16
- TypeScript/TSX syntax checks across 200 files
- Full regression output saved in `V45_TEST_LOG.txt`

## Not executed in this environment

- `forge test` or Solidity bytecode compilation: Foundry and `solc` were unavailable.
- `npm run build`: the uploaded project did not contain `node_modules`, and dependencies were not installed in the assembly environment.
- Live injected-wallet browser execution: requires Anvil, compiled V45 contracts, a configured wallet extension, and the local relay.
- Robinhood Chain deployment or canonical WETH settlement.
- Independent audit, formal verification, economic red-team review, or public-fund testing.

## Security boundary

The relay verifies P-256 signatures off-chain. The V45 Solidity router enforces the authorized owner, nonce, expiry, action scope, replay hash, execution mode, and opening-notional limits, but it does not independently verify the P-256 signature. A compromised sequencer cannot withdraw user funds through the owner-only withdrawal functions, but it may execute actions allowed by an active session. This must be replaced or strengthened before any production deployment.

## Release classification

**Unaudited local authorized-account settlement prototype. Never use with public funds.**
