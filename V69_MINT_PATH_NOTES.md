# Leverage X V69 — Mint Path

This release isolates the first-launch contract test from historical contract suites so legacy V45–V64 tests cannot block the V65 canonical launch factory compile.

## Target

1. Compile the V65 token/factory/permanent-liquidity-locker path.
2. Execute the focused V65 launch tests.
3. Advance directly to read-only Robinhood Chain preflight and closed canary deployment.

## Run

Double-click `START_V69_MINT_PATH_GATE.cmd`. The window remains open and always writes `V69_MINT_PATH_GATE_LOG.txt`.

No wallet key is requested and no transaction is sent.
