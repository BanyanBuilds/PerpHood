# PERPHOOD V47 Validation

## Executed successfully

```bash
npm run test:v47
```

V47-specific validation covers:

- SQLite WAL schema creation and integrity check
- canonical block and raw-event persistence
- deterministic market/account/position projections
- account debit/credit reconstruction from `AccountExecution`
- worker heartbeat persistence
- exclusive leader lease, active-heartbeat health, release cleanup, and failover behavior
- common rollback path and orphan removal
- recovery-job creation
- deterministic replay after rollback
- SQL durable-order idempotency
- SQL lease exclusion
- SQL fill/cancel finality
- live JSON-RPC reconciliation against a controlled RPC server
- BattlePool state-hash matching
- account-liability mismatch detection
- degraded reconciler status and recovery on a later clean run
- indexed API and operations-console integration
- cross-device Funding session recovery wiring
- readable V47 UI text
- TypeScript/TSX syntax scanning

The complete inherited V21–V46 regression chain is also executed by `test:v47`, including the BattlePool randomized tests and long/short liquidation cascades.

## Not executed in this environment

- `npm run build`: dependency installation did not complete within the available assembly environment.
- `forge test`: Foundry is unavailable.
- live Anvil indexer/reorg execution: Anvil is unavailable.
- injected-wallet browser E2E tests: require a browser wallet and deployed local contracts.

## Safety conclusion

The local accounting/indexer model passes the included deterministic validation. It is not audited, not production-deployed, and not approved for public funds.
