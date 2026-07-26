# PERPHOOD V46 Validation

## Executed successfully

```bash
npm run test:v46
```

The command completed successfully on July 25, 2026 and included the entire inherited V21–V45 regression chain plus the V46 suite.

### Inherited engine and settlement coverage

- 75 fuzz seeds
- 18,750 attempted randomized BattlePool actions
- 18,662 successful actions
- 88 safely rejected actions
- 40 admitted 20× shorts followed by 40 liquidations
- 40 admitted 20× longs followed by 40 liquidations
- Zero bad debt in both controlled cascade scenarios
- Final one-billion-token conservation
- Fixed-point curve and settlement checks
- Ordered event/candle/PNL synchronization
- V43 unified spot/perps settlement
- V44 terminal receipt reconciliation
- V45 custody, solvency, session, nonce, replay, and UI checks

### V46 coverage

- Limit and trigger comparator behavior
- Two-stage breakeven activation/retrace state machine
- Expiry
- Exponential retry backoff
- Local USD/ETH market-cap conversion
- P-256 order signing
- Tamper rejection
- Signed cancellation
- Atomic persistence
- Idempotent order insertion
- Exclusive keeper leases
- Fill finality
- Cancellation and store statistics
- Keeper failover integration
- Batch-liquidation integration
- Terminal TP/SL/Breakeven integration
- Keeper operations console
- 13/13 V46 static integration checks
- TypeScript/TSX syntax smoke across 215 files

The complete console output is retained in `V46_TEST_LOG.txt`.

## Not executed in this assembly environment

The project has no installed `node_modules`, and Foundry/Anvil are unavailable here. Therefore these checks were not represented as passed:

```bash
npm run build
npm run lint
forge test
npm run chain:v46
```

They must be executed after installing dependencies and Foundry on the local development machine.

## Safety result

V46 is a validated local engineering milestone, not production-ready financial infrastructure. The order store, keeper, signature-verification boundary, oracle reference, reorg handling, key management, deployment, and audits all require production hardening before public funds are permitted.
