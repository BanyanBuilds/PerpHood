# Leverage X V55 — Real Trading Terminal and Launch Readiness

V55 is the first fully branded Leverage X release. It preserves V54's connected-wallet Robinhood Chain token launch path and adds the execution controls required before the first real spot trade.

## Brand and public identity

- Public brand: **Leverage X**
- Domain: **leverageX.fun**
- Official LX logo, browser favicon, Apple icon, installable icons and Open Graph image
- No visible legacy project branding in the hosted runtime
- No bundled token, fake balance, fake activity, fake order book or demo market

## Real launch path

`LeverageXLaunchFactoryV55.sol` deploys a fixed one-billion-supply ERC-20 and native-ETH spot market. The creator receives no allocation and receives only tokens purchased from the public curve. The creator's total launch budget remains 0.001 ETH inclusive of the transaction gas ceiling.

The launch sequence is:

1. Upload public artwork and metadata to the `leveragex-token-media` Supabase bucket.
2. Estimate deployment gas inside the 0.001 ETH total budget.
3. Have the creator sign the factory call from the connected wallet.
4. Deploy the ERC-20 and market atomically.
5. Execute the creator genesis purchase.
6. Verify the canonical receipt, factory event, token identity, supply and metadata hash.
7. Save the confirmed launch in `leveragex_v55_launches`.
8. Hydrate the market from direct contract reads and expose it through `/api/v55/discovery`.

## P1/P2/P3 execution profiles

Every Markets and Movers category owns independent P1, P2 and P3 profiles. Each profile stores:

- Buy, Sell, Long, Short and Close slippage
- Automatic/manual network-fee handling
- Maximum network fee in ETH
- Quote deadline
- Maximum price impact
- Execution Boost route
- MEV route preference

Robinhood Chain does not receive a fake Solana-style bribe field. `Standard`, `Fast`, `Assault` and `Protected` are routing preferences. Until dedicated relay infrastructure is deployed, connected-wallet spot trades use the wallet's active RPC while still enforcing the selected fee, slippage and price-impact limits.

## Transaction lifecycle

Real V55 spot transactions now expose:

`Quote → Wallet → Submitted → Confirmed → Reconciled → Indexed`

The first four phases are sourced from the actual wallet/RPC flow. Reconciliation and indexing appear after the confirmed state is ingested. Failed quote guards or wallet transactions are reported without manufacturing a success state.

## Market truth and token intelligence

The selected-token ticket shows:

- Canonical chain ID
- Last indexed block
- Contract-sync age
- Real ETH reserve
- Curve inventory sold and remaining
- Active, indexing, stale or paused state
- Fixed one-billion supply
- No additional minting
- No transfer tax
- No blacklist/freeze path
- No creator free allocation
- Creator perps restriction

Unknown holder or wallet-intelligence fields display `Not indexed`; they are never filled with invented zeros.

## Emergency controls

The persistent utility bar can:

- Disable all quick actions
- Cancel all durable orders
- Close all open positions through their authoritative path
- Open session revocation

These controls report failures honestly. They do not claim that an order or position closed until its execution path confirms.

## Current boundary

The factory source and deployment tooling are packaged, but no V55 factory address is claimed as deployed. Mainnet stays locked. Long and Short stay disabled on V55 spot tokens until the audited unified leveraged BattlePool is deployed.
