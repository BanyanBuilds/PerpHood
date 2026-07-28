# Leverage X V73 — First Live Launch

V73 converts the deployment package into two guarded Windows actions:

1. `START_V73_FIRST_LIVE_DEPLOYMENT.cmd`
   - verifies Robinhood Chain 4663 and canonical DEX contracts
   - compiles only the mint path
   - securely prompts for the deployment key without writing it to disk
   - deploys the permanent locker and launch factory
   - verifies bytecode and saves addresses
   - leaves launches closed

2. `START_V73_FIRST_CANARY_LAUNCH.cmd`
   - configures one controlled canary creator
   - enforces a total launch budget that includes estimated gas
   - submits the first real token launch
   - saves the transaction evidence needed for pool and GMGN checks

No private key is stored in the project or written to a log.
