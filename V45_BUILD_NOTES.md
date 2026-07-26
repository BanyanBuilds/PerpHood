# PERPHOOD V45 Build Notes

## Milestone

**Authorized Account Execution + Fully Backed Internal Ledger**

V45 advances the V44 direct-wallet terminal into the intended PERPHOOD flow:

```text
Deposit once → authorize a bounded session → trade instantly → revoke or withdraw directly
```

## Added

### Contracts

- `BattleTokenV45`
- `LaunchpadMarketV45`
- `LaunchpadFactoryV45` account router/factory
- Native-ETH account deposits and withdrawals for the local reference chain
- Per-market token deposits and withdrawals
- Exact ETH and token liability accounting
- Custody-versus-liability solvency assertions
- Six scoped authorized actions
- Session expiry, nonce, replay hash, action bitmap, per-intent cap, and cumulative cap
- Owner revocation
- Normal, CloseOnly, and Paused execution modes
- Direct account-router trade fallbacks
- Router-aware market settlement preserving the shared BattlePool
- Single-credit protection for market payouts returning to the router

### Relay and session key

- Browser P-256 session-key generation
- Canonical JSON intent payload
- SHA-256 public-key hash
- Keccak intent hash
- P-256 signature verification in the local relay
- Per-session concurrency lock
- Client-order replay protection
- Confirmed receipt/event parsing
- Post-settlement custody reconciliation

### Terminal

- V45 deployment auto-discovery
- Automatic session-versus-direct execution selection
- Real internal balance shown in trade controls
- Real account Funding page
- Deposit and withdrawal receipts
- Eight-hour bounded authorization control
- One-click on-chain revocation
- Exact post-trade balance reconciliation
- Live custody health in the chain sandbox
- Direct owner escape paths when a session or relay is unavailable

### Local chain

- V45 Foundry source and test
- V45 Anvil deployment CLI
- Demo factory/account router
- Demo token and market
- Three funded account-ledger traders
- Real spot buy, long, and short demo transactions
- `public/local-chain/v45-deployment.json`

## Deliberately not claimed

- On-chain P-256 verification
- Production-grade smart-account abstraction
- Canonical WETH integration
- Durable order/indexer database
- Limit/trigger/TP/SL automation
- Redundant keepers or sequencers
- Public Robinhood Chain readiness
- Audit completion

## Validation command

```bash
npm run test:v45
```

The full inherited V21–V44 regression chain and all V45-specific dependency-free tests pass. Foundry and the dependency-backed Next.js production build were unavailable in the assembly environment.
