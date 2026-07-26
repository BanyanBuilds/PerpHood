# PerpHood V42 — Executable Local-Chain Launchpad Sandbox

V42 moves the launchpad beyond browser-only lifecycle simulation without pretending the protocol is public-chain ready.

## Added

- `LaunchpadFactoryV42.sol` local factory and registry.
- `LaunchpadMarketV42` native-ETH exponent-5 bonding market.
- Fixed one-billion-token deployment for each market.
- Creator genesis purchase executed in the market constructor using only the post-gas buy remainder.
- Real local spot `buy`, `buyFor`, `approve`, and `sell` transactions.
- 0.30% curve fee retained inside the same local market reserve.
- Permanent creator-wallet perps restriction assertion.
- Migration begin/commit digest and pause lifecycle.
- Foundry unit-test source covering creation, physical token conservation, buy/sell, creator restriction, and migration.
- `npm run chain:v42` bootstrap command: Forge compile, raw Anvil deployment, one demo launch, deployment manifest, and environment output.
- Browser launch mode selector: Browser Simulator or Anvil Contract.
- Wallet-signed Anvil launch transaction and receipt parsing.
- Chain factory, market, token, creator, block, and transaction fields persisted into the terminal market record.
- `/admin/launchpad/sandbox` deployment and readiness dashboard.
- `/api/launchpad/sandbox` RPC and manifest health endpoint.

## Intentional boundary

The executable V42 contract covers token deployment and the spot bonding curve. Leveraged execution remains on the separately tested V24 verifier/simulator route. V42 does not claim that long/short settlement, a USD oracle, migration asset transfer, keeper redundancy, or recovery procedures are production-ready.
